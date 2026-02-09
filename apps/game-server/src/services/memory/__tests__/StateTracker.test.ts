import { describe, it, expect } from 'vitest';
import { StateTracker } from '../StateTracker';

describe('StateTracker', () => {
  describe('createSnapshot / getLatestSnapshot', () => {
    it('스냅샷 생성 후 조회', () => {
      const tracker = new StateTracker();
      const input = {
        sessionId: 'session-1',
        gameState: { currentScene: '던전 입구' },
        characters: { 'char-1': { hp: 50 } },
        combatState: null,
        messageCount: 10,
        trigger: 'manual' as const,
      };

      const created = tracker.createSnapshot(input);
      expect(created).toEqual(input);

      const latest = tracker.getLatestSnapshot('session-1');
      expect(latest).toEqual(input);
    });

    it('여러 스냅샷 → 최신 반환', () => {
      const tracker = new StateTracker();
      tracker.createSnapshot({
        sessionId: 'session-1',
        gameState: { scene: 1 },
        characters: {},
        combatState: null,
        messageCount: 10,
        trigger: 'auto',
      });
      tracker.createSnapshot({
        sessionId: 'session-1',
        gameState: { scene: 2 },
        characters: {},
        combatState: null,
        messageCount: 20,
        trigger: 'auto',
      });

      const latest = tracker.getLatestSnapshot('session-1');
      expect(latest?.gameState).toEqual({ scene: 2 });
      expect(latest?.messageCount).toBe(20);
    });

    it('존재하지 않는 세션 → null', () => {
      const tracker = new StateTracker();
      expect(tracker.getLatestSnapshot('nonexistent')).toBeNull();
    });
  });

  describe('trackStateChange / getChangeHistory', () => {
    it('상태 변경 추적 및 조회', () => {
      const tracker = new StateTracker();
      tracker.trackStateChange('session-1', {
        type: 'hp_change',
        targetCharacterId: 'char-1',
        value: -10,
        description: '고블린 공격으로 10 피해',
      });
      tracker.trackStateChange('session-1', {
        type: 'item_add',
        targetCharacterId: 'char-1',
        value: '열쇠',
        description: '열쇠 획득',
      });

      const history = tracker.getChangeHistory('session-1');
      expect(history).toHaveLength(2);
      expect(history[0].type).toBe('hp_change');
      expect(history[1].type).toBe('item_add');
    });

    it('존재하지 않는 세션 → 빈 배열', () => {
      const tracker = new StateTracker();
      expect(tracker.getChangeHistory('nonexistent')).toEqual([]);
    });
  });
});
