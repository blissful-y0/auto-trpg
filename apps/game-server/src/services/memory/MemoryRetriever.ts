// 메모리 검색기 — 임베딩 기반 장면/세션 요약 검색
// DB(pgvector) 우선, 인메모리 폴백 지원

import type { SupabaseClient } from '@supabase/supabase-js';
import type { MemorySearchResult } from './types';

// 인메모리 저장 항목
interface StoredSummary {
  content: string;
  embedding: number[];
  source: 'scene_summary' | 'session_summary';
  metadata: Record<string, unknown>;
}

export class MemoryRetriever {
  // 인메모리 폴백용 세션별 요약 저장소
  private summaries: Map<string, StoredSummary[]> = new Map();

  constructor(private supabaseClient?: SupabaseClient) {}

  // 장면 요약 추가 (DB + 인메모리)
  async addSceneSummary(
    sessionId: string,
    summary: string,
    embedding: number[],
    metadata: Record<string, unknown> = {},
  ): Promise<void> {
    // 인메모리 저장 (폴백)
    this.ensureSession(sessionId);
    this.summaries.get(sessionId)!.push({
      content: summary,
      embedding,
      source: 'scene_summary',
      metadata,
    });

    // DB 저장
    if (this.supabaseClient) {
      try {
        const sceneNumber = await this.getNextSceneNumber(sessionId);
        const { error } = await this.supabaseClient.from('scene_summaries').insert({
          session_id: sessionId,
          scene_number: sceneNumber,
          summary,
          key_events: (metadata.keyEvents as string[]) ?? [],
          embedding: embedding.length > 0 ? JSON.stringify(embedding) : null,
          token_count: Math.ceil(summary.length / 3),
        });
        if (error) {
          console.error('[MemoryRetriever] 장면 요약 DB 저장 실패:', error.message);
        }
      } catch (err) {
        console.error('[MemoryRetriever] 장면 요약 DB 저장 예외:', err);
      }
    }
  }

  // 세션 요약 추가 (DB + 인메모리)
  async addSessionSummary(
    sessionId: string,
    summary: string,
    embedding: number[],
    metadata: Record<string, unknown> = {},
  ): Promise<void> {
    // 인메모리 저장 (폴백)
    this.ensureSession(sessionId);
    this.summaries.get(sessionId)!.push({
      content: summary,
      embedding,
      source: 'session_summary',
      metadata,
    });

    // DB 저장
    if (this.supabaseClient) {
      try {
        const { error } = await this.supabaseClient.from('session_summaries').insert({
          session_id: sessionId,
          summary,
          key_decisions: (metadata.keyDecisions as string[]) ?? [],
          plot_points: (metadata.plotPoints as string[]) ?? [],
          embedding: embedding.length > 0 ? JSON.stringify(embedding) : null,
        });
        if (error) {
          console.error('[MemoryRetriever] 세션 요약 DB 저장 실패:', error.message);
        }
      } catch (err) {
        console.error('[MemoryRetriever] 세션 요약 DB 저장 예외:', err);
      }
    }
  }

  // 장면 요약 검색 (pgvector 코사인 유사도 우선, 인메모리 폴백)
  async searchSceneSummaries(
    queryEmbedding: number[],
    sessionId: string,
    limit: number = 5,
  ): Promise<MemorySearchResult[]> {
    if (this.supabaseClient && queryEmbedding.length > 0) {
      try {
        const results = await this.searchDB(
          'scene_summaries',
          queryEmbedding,
          sessionId,
          limit,
        );
        if (results.length > 0) return results;
      } catch (err) {
        console.error('[MemoryRetriever] DB 장면 검색 실패, 인메모리 폴백:', err);
      }
    }
    return this.searchInMemory(queryEmbedding, sessionId, 'scene_summary', limit);
  }

  // 세션 요약 검색 (pgvector 코사인 유사도 우선, 인메모리 폴백)
  async searchSessionSummaries(
    queryEmbedding: number[],
    sessionId: string,
    limit: number = 3,
  ): Promise<MemorySearchResult[]> {
    if (this.supabaseClient && queryEmbedding.length > 0) {
      try {
        const results = await this.searchDB(
          'session_summaries',
          queryEmbedding,
          sessionId,
          limit,
        );
        if (results.length > 0) return results;
      } catch (err) {
        console.error('[MemoryRetriever] DB 세션 검색 실패, 인메모리 폴백:', err);
      }
    }
    return this.searchInMemory(queryEmbedding, sessionId, 'session_summary', limit);
  }

  // DB 벡터 검색 (pgvector 코사인 유사도)
  private async searchDB(
    table: 'scene_summaries' | 'session_summaries',
    queryEmbedding: number[],
    sessionId: string,
    limit: number,
  ): Promise<MemorySearchResult[]> {
    if (!this.supabaseClient) return [];

    // pgvector의 <=> 연산자로 코사인 거리 계산 (RPC 함수 사용)
    // 직접 쿼리가 불가하므로 embedding이 있는 행만 가져와서 클라이언트에서 정렬
    const { data, error } = await this.supabaseClient
      .from(table)
      .select('summary, key_events, embedding')
      .eq('session_id', sessionId)
      .not('embedding', 'is', null)
      .order('created_at', { ascending: false })
      .limit(limit * 3); // 여유있게 가져와서 유사도 정렬

    if (error || !data) return [];

    return data
      .map((row) => {
        const rowEmbedding = typeof row.embedding === 'string'
          ? JSON.parse(row.embedding) as number[]
          : row.embedding as number[];

        return {
          content: row.summary,
          similarity: this.cosineSimilarity(queryEmbedding, rowEmbedding),
          source: table === 'scene_summaries' ? 'scene_summary' as const : 'session_summary' as const,
          metadata: { keyEvents: row.key_events ?? [] },
        };
      })
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  }

  // 인메모리 검색 (폴백)
  private searchInMemory(
    queryEmbedding: number[],
    sessionId: string,
    source: 'scene_summary' | 'session_summary',
    limit: number,
  ): MemorySearchResult[] {
    const stored = this.summaries.get(sessionId);
    if (!stored || stored.length === 0) return [];

    const filtered = stored.filter((s) => s.source === source);

    return filtered
      .map((s) => ({
        content: s.content,
        similarity: queryEmbedding.length > 0
          ? this.cosineSimilarity(queryEmbedding, s.embedding)
          : 1, // 임베딩 없으면 전부 포함
        source: s.source,
        metadata: s.metadata,
      }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  }

  // 코사인 유사도 계산
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length || a.length === 0) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    if (denominator === 0) return 0;

    return dotProduct / denominator;
  }

  // 다음 장면 번호 조회
  private async getNextSceneNumber(sessionId: string): Promise<number> {
    if (!this.supabaseClient) return 1;

    const { data } = await this.supabaseClient
      .from('scene_summaries')
      .select('scene_number')
      .eq('session_id', sessionId)
      .order('scene_number', { ascending: false })
      .limit(1);

    return (data?.[0]?.scene_number ?? 0) + 1;
  }

  // 세션 저장소 초기화
  private ensureSession(sessionId: string): void {
    if (!this.summaries.has(sessionId)) {
      this.summaries.set(sessionId, []);
    }
  }
}
