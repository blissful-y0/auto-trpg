// pgvector + tsvector 하이브리드 검색 기반 규칙 검색기
import crypto from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Embedder } from './embedder';
import type { HotCache } from './hot-cache';
import type { Reranker } from './reranker';
import type { RuleChainer } from './rule-chainer';
import type {
  EnhancedSearchResult,
  GameContext,
  SearchOptions,
  SearchResult,
} from './types';

/** 검색 가중치 설정 */
interface RetrieverConfig {
  vectorWeight: number;
  textWeight: number;
  defaultLimit: number;
  defaultThreshold: number;
  cacheTtlMs: number;
}

const DEFAULT_CONFIG: RetrieverConfig = {
  vectorWeight: 0.7,
  textWeight: 0.3,
  defaultLimit: 5,
  defaultThreshold: 0.3,
  cacheTtlMs: 5 * 60 * 1000, // 5분
};

interface CacheEntry {
  results: SearchResult[];
  timestamp: number;
}

/** 강화 검색 옵션 */
interface EnhancedSearchOptions extends SearchOptions {
  /** 리랭킹 활성화 여부 (기본 true) */
  enableReranking?: boolean;
  /** 규칙 체이닝 활성화 여부 (기본 true) */
  enableChaining?: boolean;
  /** 핫 캐시 사용 여부 (기본 true) */
  enableHotCache?: boolean;
}

export class RuleRetriever {
  private config: RetrieverConfig;
  private supabase: SupabaseClient;
  private embedder: Embedder;
  private cache: Map<string, CacheEntry> = new Map();

  // 강화 검색 컴포넌트 (선택적 주입)
  private reranker: Reranker | null = null;
  private ruleChainer: RuleChainer | null = null;
  private hotCache: HotCache | null = null;

  constructor(
    supabase: SupabaseClient,
    embedder: Embedder,
    config: Partial<RetrieverConfig> = {},
  ) {
    this.supabase = supabase;
    this.embedder = embedder;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** 강화 검색 컴포넌트 설정 */
  setEnhancedComponents(components: {
    reranker?: Reranker;
    ruleChainer?: RuleChainer;
    hotCache?: HotCache;
  }): void {
    if (components.reranker) this.reranker = components.reranker;
    if (components.ruleChainer) this.ruleChainer = components.ruleChainer;
    if (components.hotCache) this.hotCache = components.hotCache;
  }

  /** 쿼리로 관련 규칙 청크 검색 (하이브리드: 벡터 + 텍스트) */
  async search(query: string, options: SearchOptions): Promise<SearchResult[]> {
    const limit = options.limit ?? this.config.defaultLimit;
    const threshold = options.similarityThreshold ?? this.config.defaultThreshold;

    // 쿼리 임베딩 생성
    const queryEmbedding = await this.embedder.embed(query);

    // 하이브리드 검색 RPC 호출
    const { data, error } = await this.supabase.rpc('hybrid_search', {
      query_text: query,
      query_embedding: queryEmbedding,
      match_count: limit,
      similarity_threshold: threshold,
      rulebook_ids: options.rulebookIds,
      filter_categories: options.categories ?? [],
      vector_weight: this.config.vectorWeight,
      text_weight: this.config.textWeight,
    });

    if (error) {
      throw new Error(`하이브리드 검색 실패: ${error.message}`);
    }

    return (data ?? []).map((row: Record<string, unknown>) => ({
      id: row.id as string,
      content: row.content as string,
      page: row.page as number | undefined,
      chapter: row.chapter as string | undefined,
      section: row.section as string | undefined,
      category: row.category as string,
      similarity: row.similarity as number,
      textRank: row.text_rank as number,
    }));
  }

  /** 강화 검색: 하이브리드 검색 → 리랭킹 → 규칙 체이닝 → 핫 캐시 */
  async searchEnhanced(
    query: string,
    options: EnhancedSearchOptions,
    gameContext?: GameContext,
  ): Promise<EnhancedSearchResult> {
    const startTime = Date.now();
    const enableReranking = options.enableReranking ?? true;
    const enableChaining = options.enableChaining ?? true;
    const enableHotCache = options.enableHotCache ?? true;
    let cacheHits = 0;

    // 1. 핫 캐시에서 검색 결과 조회
    const queryHash = this.hashQuery(query, options);
    if (enableHotCache && this.hotCache) {
      const cached = await this.hotCache.getSearchResult(queryHash);
      if (cached) {
        const rulebookId = options.rulebookIds[0];
        if (rulebookId) {
          await this.hotCache.recordHit(rulebookId);
        }
        cacheHits = cached.length;
        return {
          results: cached.map((r) => ({
            ...r,
            originalScore: r.similarity * 0.7 + r.textRank * 0.3,
            relevanceScore: r.similarity * 0.7 + r.textRank * 0.3,
          })),
          chained: [],
          meta: {
            originalCount: cached.length,
            rerankedCount: cached.length,
            chainedCount: 0,
            cacheHits,
            latencyMs: Date.now() - startTime,
          },
        };
      }
    }

    // 2. 하이브리드 검색 (리랭킹 대비 더 많은 후보 검색)
    const searchLimit = enableReranking && this.reranker
      ? Math.max(20, (options.limit ?? 5) * 4)
      : options.limit;

    const rawResults = await this.search(query, { ...options, limit: searchLimit });
    const originalCount = rawResults.length;

    // 3. 리랭킹
    let finalResults;
    if (enableReranking && this.reranker && rawResults.length > 0) {
      finalResults = await this.reranker.rerank(query, rawResults, gameContext);
    } else {
      finalResults = rawResults.map((r) => ({
        ...r,
        originalScore: r.similarity * 0.7 + r.textRank * 0.3,
        relevanceScore: r.similarity * 0.7 + r.textRank * 0.3,
      }));
    }

    // 4. 규칙 체이닝
    let chainedRules: EnhancedSearchResult['chained'] = [];
    if (enableChaining && this.ruleChainer && finalResults.length > 0) {
      // RerankResult → SearchResult 변환하여 체이닝
      const searchResults: SearchResult[] = finalResults.map((r) => ({
        id: r.id,
        content: r.content,
        page: r.page,
        chapter: r.chapter,
        section: r.section,
        category: r.category,
        similarity: r.relevanceScore,
        textRank: 0,
      }));

      try {
        const { chained } = await this.ruleChainer.chain(
          searchResults,
          options.rulebookIds,
        );
        chainedRules = chained;
      } catch (error) {
        console.error('[RuleRetriever] 규칙 체이닝 실패:', error);
      }
    }

    // 5. 핫 캐시에 결과 저장 + 접근 횟수 기록
    if (enableHotCache && this.hotCache) {
      const cacheResults: SearchResult[] = finalResults.map((r) => ({
        id: r.id,
        content: r.content,
        page: r.page,
        chapter: r.chapter,
        section: r.section,
        category: r.category,
        similarity: r.relevanceScore,
        textRank: 0,
      }));

      await this.hotCache.setSearchResult(queryHash, cacheResults);

      const rulebookId = options.rulebookIds[0];
      if (rulebookId) {
        await this.hotCache.setMany(cacheResults, rulebookId);
        for (const result of cacheResults) {
          await this.hotCache.recordAccess(result.id, rulebookId);
        }
      }
    }

    return {
      results: finalResults,
      chained: chainedRules,
      meta: {
        originalCount,
        rerankedCount: finalResults.length,
        chainedCount: chainedRules.length,
        cacheHits,
        latencyMs: Date.now() - startTime,
      },
    };
  }

  /** 검색 쿼리 해시 생성 (캐시 키용) */
  private hashQuery(query: string, options: SearchOptions): string {
    const input = JSON.stringify({
      q: query,
      rb: options.rulebookIds.sort(),
      cat: options.categories?.sort(),
      lim: options.limit,
    });
    return crypto.createHash('sha256').update(input).digest('hex').slice(0, 16);
  }

  /** 게임 액션에서 검색 쿼리 생성 */
  buildQuery(action: string, context: GameContext): string {
    const parts: string[] = [action];

    if (context.currentScene) {
      parts.push(`scene: ${context.currentScene}`);
    }

    // 액션에서 규칙 관련 키워드 추출
    const ruleKeywords = this.extractRuleKeywords(action);
    if (ruleKeywords.length > 0) {
      parts.push(ruleKeywords.join(' '));
    }

    return parts.join(' ');
  }

  /** 검색 결과 캐싱 조회 (장면 단위) */
  getCachedRules(sessionId: string, category: string): SearchResult[] | null {
    const key = `${sessionId}:${category}`;
    const entry = this.cache.get(key);

    if (!entry) return null;

    // TTL 만료 확인
    if (Date.now() - entry.timestamp > this.config.cacheTtlMs) {
      this.cache.delete(key);
      return null;
    }

    return entry.results;
  }

  /** 검색 결과 캐싱 저장 */
  setCachedRules(
    sessionId: string,
    category: string,
    results: SearchResult[],
  ): void {
    const key = `${sessionId}:${category}`;
    this.cache.set(key, { results, timestamp: Date.now() });
  }

  /** 캐시 초기화 */
  clearCache(sessionId?: string): void {
    if (sessionId) {
      for (const key of this.cache.keys()) {
        if (key.startsWith(`${sessionId}:`)) {
          this.cache.delete(key);
        }
      }
    } else {
      this.cache.clear();
    }
  }

  /** 액션에서 규칙 관련 키워드 추출 */
  private extractRuleKeywords(action: string): string[] {
    const keywords: string[] = [];
    const lower = action.toLowerCase();

    const rulePatterns: Array<{ pattern: RegExp; keyword: string }> = [
      { pattern: /attack|hit|strike/i, keyword: 'attack roll combat' },
      { pattern: /cast|spell|magic/i, keyword: 'spellcasting rules' },
      { pattern: /check|skill|ability/i, keyword: 'ability check skill' },
      { pattern: /save|saving throw/i, keyword: 'saving throw' },
      { pattern: /move|dash|disengage/i, keyword: 'movement speed' },
      { pattern: /heal|potion|rest/i, keyword: 'healing hit points' },
      { pattern: /stealth|hide|sneak/i, keyword: 'stealth perception' },
      { pattern: /grapple|shove|push/i, keyword: 'grapple contest' },
    ];

    for (const { pattern, keyword } of rulePatterns) {
      if (pattern.test(lower)) {
        keywords.push(keyword);
      }
    }

    return keywords;
  }
}
