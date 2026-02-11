import { describe, it, expect, vi } from 'vitest';
import { MemoryHierarchy } from '../MemoryHierarchy';
import { BudgetAllocator } from '../BudgetAllocator';
import { Summarizer } from '../Summarizer';
import { StateTracker } from '../StateTracker';
import { SceneDetector } from '../SceneDetector';
import { MemoryRetriever } from '../MemoryRetriever';

// Summarizer 모킹
function createMockSummarizer(): Summarizer {
  return {
    summarizeScene: vi.fn().mockResolvedValue({
      summary: '모킹된 장면 요약',
      keyEvents: ['이벤트 1', '이벤트 2'],
      tokenCount: 10,
    }),
    summarizeSession: vi.fn().mockResolvedValue({
      summary: '모킹된 세션 요약',
      keyEvents: ['세션 이벤트'],
      tokenCount: 20,
    }),
  } as unknown as Summarizer;
}

describe('MemoryHierarchy', () => {
  describe('buildTieredContext', () => {
    it('예산 내에서 컨텍스트 생성', async () => {
      const hierarchy = new MemoryHierarchy(
        new BudgetAllocator(),
        createMockSummarizer(),
        new StateTracker(),
        new SceneDetector(),
        new MemoryRetriever(),
      );

      const result = await hierarchy.buildTieredContext(
        'exploration',
        ['시스템 프롬프트', '캐릭터 시트'],
        ['최근 메시지 1', '최근 메시지 2'],
      );

      expect(result.tier0).toEqual(['시스템 프롬프트', '캐릭터 시트']);
      expect(result.tier1).toEqual(['최근 메시지 1', '최근 메시지 2']);
      expect(result.tier2).toEqual([]); // 임베딩 미제공
      expect(result.tier3).toEqual([]); // 임베딩 미제공
      expect(result.budget.total).toBe(80000);
    });

    it('예산 초과 콘텐츠 잘림', async () => {
      const hierarchy = new MemoryHierarchy(
        new BudgetAllocator(),
        createMockSummarizer(),
        new StateTracker(),
        new SceneDetector(),
        new MemoryRetriever(),
      );

      // 매우 긴 콘텐츠 생성 (tier0 예산 초과하도록)
      const longContent = 'a'.repeat(100000); // ~33333 토큰
      const result = await hierarchy.buildTieredContext(
        'skill_check', // tier0: 25000 토큰
        [longContent, '추가 콘텐츠'],
        [],
      );

      // 첫 번째 콘텐츠가 예산을 초과하므로 그것만 포함 안됨
      expect(result.tier0.length).toBeLessThanOrEqual(1);
    });

    it('MemoryRetriever로 tier2/3 검색', async () => {
      const retriever = new MemoryRetriever();
      // 장면 요약 추가 (벡터 유사도 테스트용)
      await retriever.addSceneSummary('session-1', '고블린 전투 장면', [1, 0, 0]);
      await retriever.addSceneSummary('session-1', '마을 탐색 장면', [0, 1, 0]);
      await retriever.addSessionSummary('session-1', '세션 전체 요약', [0.5, 0.5, 0]);

      const hierarchy = new MemoryHierarchy(
        new BudgetAllocator(),
        createMockSummarizer(),
        new StateTracker(),
        new SceneDetector(),
        retriever,
      );

      const result = await hierarchy.buildTieredContext(
        'combat',
        ['시스템 프롬프트'],
        ['최근 메시지'],
        [1, 0, 0], // 전투 관련 쿼리
        'session-1',
      );

      // tier2에 장면 요약이 포함되어야 함
      expect(result.tier2.length).toBeGreaterThan(0);
      // 고블린 전투가 더 유사하므로 첫 번째로 나와야 함
      expect(result.tier2[0]).toBe('고블린 전투 장면');
      // tier3에 세션 요약 포함
      expect(result.tier3.length).toBeGreaterThan(0);
    });
  });

  describe('onPostResponse', () => {
    it('장면 전환 시 요약 생성', async () => {
      const summarizer = createMockSummarizer();
      const stateTracker = new StateTracker();
      const retriever = new MemoryRetriever();

      const hierarchy = new MemoryHierarchy(
        new BudgetAllocator(),
        summarizer,
        stateTracker,
        new SceneDetector(),
        retriever,
      );

      await hierarchy.onPostResponse('session-1', {
        sceneTransition: { newLocation: '던전 깊은 곳' },
        messageCount: 15,
        recentMessages: [
          { role: 'user', content: '문을 열었다' },
          { role: 'assistant', content: '어두운 복도가 보입니다' },
        ],
      });

      // Summarizer가 호출되었는지 확인
      expect(summarizer.summarizeScene).toHaveBeenCalledOnce();
      // 스냅샷이 생성되었는지 확인
      const snapshot = stateTracker.getLatestSnapshot('session-1');
      expect(snapshot).not.toBeNull();
      expect(snapshot?.trigger).toBe('scene_change');
    });

    it('장면 전환 없을 때 요약 미생성', async () => {
      const summarizer = createMockSummarizer();

      const hierarchy = new MemoryHierarchy(
        new BudgetAllocator(),
        summarizer,
        new StateTracker(),
        new SceneDetector(),
        new MemoryRetriever(),
      );

      await hierarchy.onPostResponse('session-1', {
        messageCount: 5,
        recentMessages: [
          { role: 'user', content: '앞으로 걸어간다' },
        ],
      });

      // 장면 전환이 없으면 Summarizer 호출 안됨
      expect(summarizer.summarizeScene).not.toHaveBeenCalled();
    });

    it('상태 변경 추적', async () => {
      const stateTracker = new StateTracker();
      const hierarchy = new MemoryHierarchy(
        new BudgetAllocator(),
        createMockSummarizer(),
        stateTracker,
        new SceneDetector(),
        new MemoryRetriever(),
      );

      await hierarchy.onPostResponse('session-1', {
        stateChanges: [
          { type: 'hp_change', targetCharacterId: 'char-1', value: -5 },
        ],
        messageCount: 3,
      });

      const history = stateTracker.getChangeHistory('session-1');
      expect(history).toHaveLength(1);
      expect(history[0].type).toBe('hp_change');
    });

    it('recentMessages 없으면 요약 미생성 (장면 전환이어도)', async () => {
      const summarizer = createMockSummarizer();

      const hierarchy = new MemoryHierarchy(
        new BudgetAllocator(),
        summarizer,
        new StateTracker(),
        new SceneDetector(),
        new MemoryRetriever(),
      );

      await hierarchy.onPostResponse('session-1', {
        sceneTransition: { newLocation: '새 장소' },
        messageCount: 10,
        // recentMessages 없음
      });

      expect(summarizer.summarizeScene).not.toHaveBeenCalled();
    });
  });
});
