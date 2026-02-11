// LLM 기반 리랭커 — 저비용 모델(Haiku/Flash)로 검색 결과 관련성 재평가
import type { LLMRouter } from '../llm/router';
import type { GameContext, RerankResult, SearchResult } from './types';

/** 리랭커 설정 */
interface RerankerConfig {
  /** 리랭킹 대상 최대 수 */
  maxCandidates: number;
  /** 최종 반환 수 */
  topK: number;
  /** 최소 관련성 점수 */
  minRelevanceScore: number;
  /** LLM 호출 당 처리 수 */
  batchSize: number;
}

const DEFAULT_CONFIG: RerankerConfig = {
  maxCandidates: 20,
  topK: 5,
  minRelevanceScore: 0.3,
  batchSize: 10,
};

/** LLM 응답에서 파싱할 점수 항목 */
interface ScoreEntry {
  id: string;
  score: number;
}

export class Reranker {
  private llmRouter: LLMRouter;
  private config: RerankerConfig;

  constructor(llmRouter: LLMRouter, config: Partial<RerankerConfig> = {}) {
    this.llmRouter = llmRouter;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** 검색 결과를 쿼리 관련성 기준으로 리랭킹 */
  async rerank(
    query: string,
    candidates: SearchResult[],
    gameContext?: GameContext,
  ): Promise<RerankResult[]> {
    // 후보 수 제한
    const limited = candidates.slice(0, this.config.maxCandidates);

    if (limited.length === 0) {
      return [];
    }

    // 배치 단위로 LLM 스코어링
    const allScores: ScoreEntry[] = [];

    for (let i = 0; i < limited.length; i += this.config.batchSize) {
      const batch = limited.slice(i, i + this.config.batchSize);
      try {
        const scores = await this.scoreBatch(query, batch, gameContext);
        allScores.push(...scores);
      } catch (error) {
        // LLM 호출 실패 시 원본 점수를 그대로 사용 (graceful degradation)
        console.error('[Reranker] LLM 스코어링 실패, 원본 점수 사용:', error);
        for (const candidate of batch) {
          allScores.push({
            id: candidate.id,
            score: candidate.similarity * 0.7 + candidate.textRank * 0.3,
          });
        }
      }
    }

    // 점수 매핑 생성
    const scoreMap = new Map(allScores.map((s) => [s.id, s.score]));

    // 리랭킹 결과 생성 + 점수 필터링 + 정렬
    const reranked: RerankResult[] = limited
      .map((candidate) => ({
        id: candidate.id,
        content: candidate.content,
        category: candidate.category,
        originalScore: candidate.similarity * 0.7 + candidate.textRank * 0.3,
        relevanceScore: scoreMap.get(candidate.id) ?? 0,
        page: candidate.page,
        chapter: candidate.chapter,
        section: candidate.section,
      }))
      .filter((r) => r.relevanceScore >= this.config.minRelevanceScore)
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, this.config.topK);

    return reranked;
  }

  /** LLM에 관련성 점수 요청 (배치) */
  private async scoreBatch(
    query: string,
    batch: SearchResult[],
    gameContext?: GameContext,
  ): Promise<ScoreEntry[]> {
    const prompt = this.buildRerankPrompt(query, batch, gameContext);

    const { provider, model } = this.llmRouter.getProvider('rerank');
    const response = await provider.generateText({
      messages: [{ role: 'user', content: prompt }],
      model,
      temperature: 0,
      maxTokens: 512,
    });

    return this.parseScores(response.content, batch);
  }

  /** 리랭킹 프롬프트 생성 */
  private buildRerankPrompt(
    query: string,
    batch: SearchResult[],
    gameContext?: GameContext,
  ): string {
    const contextInfo = gameContext?.currentScene
      ? `\n현재 장면: ${gameContext.currentScene}`
      : '';

    const chunks = batch
      .map((c, i) => `[${i + 1}] ${c.content.slice(0, 300)}`)
      .join('\n\n');

    return `당신은 TRPG 규칙서 검색 관련성 평가자입니다.
플레이어 액션: "${query}"${contextInfo}

다음 규칙서 청크들의 관련성을 0.0~1.0으로 평가하세요.
관련성이 높을수록 1.0에 가까운 점수를 부여합니다.

${chunks}

JSON 배열로만 응답하세요 (다른 텍스트 없이):
[{"id":"1","score":0.85},{"id":"2","score":0.3}]`;
  }

  /** LLM 응답에서 점수 파싱 */
  private parseScores(
    responseContent: string,
    batch: SearchResult[],
  ): ScoreEntry[] {
    try {
      // JSON 배열 추출 (응답에 부가 텍스트가 있을 수 있음)
      const jsonMatch = responseContent.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        throw new Error('JSON 배열을 찾을 수 없습니다');
      }

      const parsed: Array<{ id: string; score: number }> = JSON.parse(jsonMatch[0]);

      // id를 1-based 인덱스에서 실제 청크 ID로 매핑
      return parsed.map((entry) => {
        const index = parseInt(entry.id, 10) - 1;
        const candidate = batch[index];
        return {
          id: candidate?.id ?? entry.id,
          score: Math.max(0, Math.min(1, entry.score)),
        };
      });
    } catch {
      // 파싱 실패 시 원본 점수 폴백
      console.error('[Reranker] 점수 파싱 실패, 원본 점수 사용');
      return batch.map((c) => ({
        id: c.id,
        score: c.similarity * 0.7 + c.textRank * 0.3,
      }));
    }
  }
}
