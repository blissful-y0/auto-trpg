// pgvector + tsvector 하이브리드 검색 기반 규칙 검색기
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Embedder } from './embedder';
import type { GameContext, SearchOptions, SearchResult } from './types';

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

export class RuleRetriever {
  private config: RetrieverConfig;
  private supabase: SupabaseClient;
  private embedder: Embedder;
  private cache: Map<string, CacheEntry> = new Map();

  constructor(
    supabase: SupabaseClient,
    embedder: Embedder,
    config: Partial<RetrieverConfig> = {},
  ) {
    this.supabase = supabase;
    this.embedder = embedder;
    this.config = { ...DEFAULT_CONFIG, ...config };
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
