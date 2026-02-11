// 메모리 계층 오케스트레이터
// BudgetAllocator, Summarizer, StateTracker, SceneDetector, MemoryRetriever를 조합하여
// 계층화된 컨텍스트를 생성하고 장면 전환 시 자동 요약을 수행

import type { BudgetAllocator } from './BudgetAllocator';
import type { Summarizer } from './Summarizer';
import type { StateTracker } from './StateTracker';
import type { SceneDetector } from './SceneDetector';
import type { MemoryRetriever } from './MemoryRetriever';
import type {
  BudgetProfile,
  TieredContext,
  SceneTransition,
  StateChangeInfo,
} from './types';

// onPostResponse 파라미터
export interface PostResponseParams {
  sceneTransition?: SceneTransition;
  stateChanges?: StateChangeInfo[];
  combatEnded?: boolean;
  messageCount: number;
  recentMessages?: Array<{ role: string; content: string }>;
}

// 임베딩 생성 함수 타입
export type EmbeddingGenerator = (text: string) => Promise<{ embedding: number[] }>;

export class MemoryHierarchy {
  constructor(
    private budgetAllocator: BudgetAllocator,
    private summarizer: Summarizer,
    private stateTracker: StateTracker,
    private sceneDetector: SceneDetector,
    private memoryRetriever: MemoryRetriever,
    private embeddingGenerator?: EmbeddingGenerator,
  ) {}

  // 계층화된 컨텍스트 생성
  async buildTieredContext(
    profile: BudgetProfile,
    tier0Content: string[],
    tier1Content: string[],
    queryEmbedding?: number[],
    sessionId?: string,
  ): Promise<TieredContext> {
    const budget = this.budgetAllocator.allocate(profile);

    // Tier 0/1은 호출자가 제공
    const tier0 = this.fitToBudget(tier0Content, budget.tier0);
    const tier1 = this.fitToBudget(tier1Content, budget.tier1);

    // Tier 2: 장면 요약 검색
    let tier2: string[] = [];
    if (queryEmbedding && sessionId) {
      const sceneResults = await this.memoryRetriever.searchSceneSummaries(
        queryEmbedding,
        sessionId,
      );
      tier2 = this.fitToBudget(
        sceneResults.map((r) => r.content),
        budget.tier2,
      );
    }

    // Tier 3: 세션 요약 검색
    let tier3: string[] = [];
    if (queryEmbedding && sessionId) {
      const sessionResults = await this.memoryRetriever.searchSessionSummaries(
        queryEmbedding,
        sessionId,
      );
      tier3 = this.fitToBudget(
        sessionResults.map((r) => r.content),
        budget.tier3,
      );
    }

    return { tier0, tier1, tier2, tier3, budget };
  }

  // GM 응답 후 처리 — 장면 전환 감지 및 요약 생성
  async onPostResponse(
    sessionId: string,
    params: PostResponseParams,
  ): Promise<void> {
    // 상태 변경 추적
    if (params.stateChanges) {
      for (const change of params.stateChanges) {
        this.stateTracker.trackStateChange(sessionId, change);
      }
    }

    // 장면 전환 감지
    const detection = this.sceneDetector.detect({
      sceneTransition: params.sceneTransition,
      stateChanges: params.stateChanges,
      combatEnded: params.combatEnded,
      messageCount: params.messageCount,
    });

    if (!detection.detected) return;

    // 장면 전환 감지 시: 요약 생성 + 스냅샷 저장
    if (params.recentMessages && params.recentMessages.length > 0) {
      const result = await this.summarizer.summarizeScene(params.recentMessages);

      // 스냅샷 저장
      this.stateTracker.createSnapshot({
        sessionId,
        gameState: { summary: result.summary, keyEvents: result.keyEvents },
        characters: {},
        combatState: params.combatEnded ? { ended: true } : null,
        messageCount: params.messageCount,
        trigger: 'scene_change',
      });

      // 임베딩 생성 (가능한 경우)
      let embedding: number[] = [];
      if (this.embeddingGenerator) {
        try {
          const embResult = await this.embeddingGenerator(result.summary);
          embedding = embResult.embedding;
        } catch (err) {
          console.error('[MemoryHierarchy] 임베딩 생성 실패:', err);
        }
      }

      // DB + 인메모리 저장
      await this.memoryRetriever.addSceneSummary(
        sessionId,
        result.summary,
        embedding,
        { keyEvents: result.keyEvents, trigger: detection.trigger },
      );
    }
  }

  // 예산 내에서 콘텐츠 채우기
  private fitToBudget(contents: string[], budgetTokens: number): string[] {
    const result: string[] = [];
    let usedTokens = 0;

    for (const content of contents) {
      const tokens = this.budgetAllocator.estimateTokens(content);
      if (usedTokens + tokens > budgetTokens) break;
      result.push(content);
      usedTokens += tokens;
    }

    return result;
  }
}
