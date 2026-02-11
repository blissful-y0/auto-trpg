// 관련 규칙 체이닝 — 검색된 규칙에서 연관 규칙을 사전 로드
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChainedRule, SearchResult } from './types';

/** 규칙 체이너 설정 */
interface RuleChainerConfig {
  /** 최대 체이닝 깊이 (재귀 방지) */
  maxChainDepth: number;
  /** 최대 체이닝 규칙 수 */
  maxChainedRules: number;
  /** 같은 챕터 가중치 */
  sameChapterWeight: number;
  /** 같은 섹션 가중치 */
  sameSectionWeight: number;
  /** 명시적 참조 가중치 */
  referenceWeight: number;
}

const DEFAULT_CONFIG: RuleChainerConfig = {
  maxChainDepth: 1,
  maxChainedRules: 3,
  sameChapterWeight: 0.8,
  sameSectionWeight: 0.9,
  referenceWeight: 1.0,
};

/** 본문에서 추출된 참조 정보 */
interface ExtractedReference {
  type: 'chapter' | 'section' | 'page';
  value: string;
}

/** 참조 파싱용 정규식 패턴 */
const REFERENCE_PATTERNS: Array<{ source: string; flags: string; type: ExtractedReference['type'] }> = [
  { source: 'see (?:chapter|ch\\.?)\\s*(\\d+)', flags: 'gi', type: 'chapter' },
  { source: '(?:페이지|p\\.?)\\s*(\\d+)\\s*참조', flags: 'gi', type: 'page' },
  { source: '(?:section|§)\\s*([\\d.]+)', flags: 'gi', type: 'section' },
  { source: 'as described in ["\'](.+?)["\']', flags: 'gi', type: 'section' },
  { source: '(?:챕터|장)\\s*(\\d+)\\s*(?:참조|참고)', flags: 'gi', type: 'chapter' },
];

export class RuleChainer {
  private supabase: SupabaseClient;
  private config: RuleChainerConfig;

  constructor(supabase: SupabaseClient, config: Partial<RuleChainerConfig> = {}) {
    this.supabase = supabase;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** 검색 결과에 연관 규칙 체이닝 */
  async chain(
    results: SearchResult[],
    rulebookIds: string[],
  ): Promise<{
    original: SearchResult[];
    chained: ChainedRule[];
  }> {
    if (results.length === 0) {
      return { original: results, chained: [] };
    }

    // 이미 포함된 청크 ID 추적 (중복 방지)
    const existingIds = new Set(results.map((r) => r.id));
    const chainedRules: ChainedRule[] = [];

    for (const result of results) {
      if (chainedRules.length >= this.config.maxChainedRules) break;

      const remaining = this.config.maxChainedRules - chainedRules.length;
      const candidates = await this.findRelatedRules(result, rulebookIds, remaining);

      for (const candidate of candidates) {
        if (existingIds.has(candidate.result.id)) continue;
        if (chainedRules.length >= this.config.maxChainedRules) break;

        existingIds.add(candidate.result.id);
        chainedRules.push(candidate);
      }
    }

    // 체이닝 점수로 정렬
    const sorted = [...chainedRules].sort((a, b) => b.chainScore - a.chainScore);

    return { original: results, chained: sorted };
  }

  /** 단일 검색 결과에서 관련 규칙 찾기 */
  private async findRelatedRules(
    result: SearchResult,
    rulebookIds: string[],
    limit: number,
  ): Promise<ChainedRule[]> {
    const candidates: ChainedRule[] = [];

    // 1. 본문 내 명시적 참조 해석
    const references = this.extractReferences(result.content);
    if (references.length > 0) {
      const refResults = await this.resolveReferences(rulebookIds, references);
      for (const ref of refResults) {
        candidates.push({
          result: ref,
          chainReason: 'explicit_reference',
          chainScore: this.config.referenceWeight,
        });
      }
    }

    // 2. 같은 섹션 내 인접 청크
    if (result.section && candidates.length < limit) {
      const sectionResults = await this.findAdjacentChunks(
        rulebookIds,
        result.chapter,
        result.section,
        result.id,
      );
      for (const adj of sectionResults) {
        candidates.push({
          result: adj,
          chainReason: 'same_section',
          chainScore: this.config.sameSectionWeight,
        });
      }
    }

    // 3. 같은 챕터 내 관련 청크 (섹션이 다른 경우)
    if (result.chapter && candidates.length < limit) {
      const chapterResults = await this.findAdjacentChunks(
        rulebookIds,
        result.chapter,
        undefined,
        result.id,
      );
      for (const adj of chapterResults) {
        // 이미 섹션 레벨에서 추가된 것은 건너뜀
        if (candidates.some((c) => c.result.id === adj.id)) continue;
        candidates.push({
          result: adj,
          chainReason: 'same_chapter',
          chainScore: this.config.sameChapterWeight,
        });
      }
    }

    return candidates.slice(0, limit);
  }

  /** 본문에서 규칙 참조 추출 (matchAll 사용) */
  private extractReferences(content: string): ExtractedReference[] {
    const refs: ExtractedReference[] = [];

    for (const { source, flags, type } of REFERENCE_PATTERNS) {
      const regex = new RegExp(source, flags);
      for (const match of content.matchAll(regex)) {
        if (match[1]) {
          refs.push({ type, value: match[1].trim() });
        }
      }
    }

    return refs;
  }

  /** 같은 섹션/챕터 내 인접 청크 조회 */
  private async findAdjacentChunks(
    rulebookIds: string[],
    chapter?: string,
    section?: string,
    excludeId?: string,
  ): Promise<SearchResult[]> {
    let query = this.supabase
      .from('rulebook_chunks')
      .select('id, content, page, chapter, section, category')
      .in('rulebook_id', rulebookIds)
      .limit(3);

    if (chapter) {
      query = query.eq('chapter', chapter);
    }
    if (section) {
      query = query.eq('section', section);
    }
    if (excludeId) {
      query = query.neq('id', excludeId);
    }

    const { data, error } = await query;
    if (error) {
      console.error('[RuleChainer] 인접 청크 조회 실패:', error.message);
      return [];
    }

    return (data ?? []).map((row: Record<string, unknown>) => ({
      id: row.id as string,
      content: row.content as string,
      page: row.page as number | undefined,
      chapter: row.chapter as string | undefined,
      section: row.section as string | undefined,
      category: (row.category as string) || 'GENERAL',
      similarity: 0,
      textRank: 0,
    }));
  }

  /** 명시적 참조 대상 청크 조회 */
  private async resolveReferences(
    rulebookIds: string[],
    references: ExtractedReference[],
  ): Promise<SearchResult[]> {
    const results: SearchResult[] = [];

    for (const ref of references) {
      let query = this.supabase
        .from('rulebook_chunks')
        .select('id, content, page, chapter, section, category')
        .in('rulebook_id', rulebookIds)
        .limit(2);

      switch (ref.type) {
        case 'chapter':
          query = query.ilike('chapter', `%${ref.value}%`);
          break;
        case 'section':
          query = query.ilike('section', `%${ref.value}%`);
          break;
        case 'page':
          query = query.eq('page', parseInt(ref.value, 10));
          break;
      }

      const { data, error } = await query;
      if (error) {
        console.error('[RuleChainer] 참조 해석 실패:', error.message);
        continue;
      }

      for (const row of data ?? []) {
        results.push({
          id: row.id as string,
          content: row.content as string,
          page: row.page as number | undefined,
          chapter: row.chapter as string | undefined,
          section: row.section as string | undefined,
          category: (row.category as string) || 'GENERAL',
          similarity: 0,
          textRank: 0,
        });
      }
    }

    return results;
  }
}
