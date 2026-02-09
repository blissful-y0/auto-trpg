// 메모리 검색기 — 임베딩 기반 장면/세션 요약 검색
// 코사인 유사도로 관련 요약을 찾아 Tier 2/3 컨텍스트 구성

import type { MemorySearchResult } from './types';

// 인메모리 저장 항목
interface StoredSummary {
  content: string;
  embedding: number[];
  source: 'scene_summary' | 'session_summary';
  metadata: Record<string, unknown>;
}

export class MemoryRetriever {
  // 세션별 요약 저장소
  private summaries: Map<string, StoredSummary[]> = new Map();

  // 장면 요약 추가
  addSceneSummary(
    sessionId: string,
    summary: string,
    embedding: number[],
    metadata: Record<string, unknown> = {},
  ): void {
    this.ensureSession(sessionId);
    this.summaries.get(sessionId)!.push({
      content: summary,
      embedding,
      source: 'scene_summary',
      metadata,
    });
  }

  // 세션 요약 추가
  addSessionSummary(
    sessionId: string,
    summary: string,
    embedding: number[],
    metadata: Record<string, unknown> = {},
  ): void {
    this.ensureSession(sessionId);
    this.summaries.get(sessionId)!.push({
      content: summary,
      embedding,
      source: 'session_summary',
      metadata,
    });
  }

  // 장면 요약 검색 (코사인 유사도 기반)
  searchSceneSummaries(
    queryEmbedding: number[],
    sessionId: string,
    limit: number = 5,
  ): MemorySearchResult[] {
    return this.search(queryEmbedding, sessionId, 'scene_summary', limit);
  }

  // 세션 요약 검색 (코사인 유사도 기반)
  searchSessionSummaries(
    queryEmbedding: number[],
    sessionId: string,
    limit: number = 3,
  ): MemorySearchResult[] {
    return this.search(queryEmbedding, sessionId, 'session_summary', limit);
  }

  // 공통 검색 로직
  private search(
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
        similarity: this.cosineSimilarity(queryEmbedding, s.embedding),
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

  // 세션 저장소 초기화
  private ensureSession(sessionId: string): void {
    if (!this.summaries.has(sessionId)) {
      this.summaries.set(sessionId, []);
    }
  }
}
