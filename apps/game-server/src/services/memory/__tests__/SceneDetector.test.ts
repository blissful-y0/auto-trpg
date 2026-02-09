import { describe, it, expect } from 'vitest';
import { SceneDetector } from '../SceneDetector';

describe('SceneDetector', () => {
  const detector = new SceneDetector();

  describe('detect', () => {
    it('sceneTransition 감지 (newLocation)', () => {
      const result = detector.detect({
        sceneTransition: { newLocation: '던전 깊은 곳' },
        messageCount: 5,
      });
      expect(result.detected).toBe(true);
      expect(result.trigger).toBe('scene_transition');
    });

    it('sceneTransition 감지 (timeAdvance)', () => {
      const result = detector.detect({
        sceneTransition: { timeAdvance: '다음 날 아침' },
        messageCount: 5,
      });
      expect(result.detected).toBe(true);
      expect(result.trigger).toBe('scene_transition');
    });

    it('sceneTransition 감지 (mood)', () => {
      const result = detector.detect({
        sceneTransition: { mood: '긴장감' },
        messageCount: 5,
      });
      expect(result.detected).toBe(true);
      expect(result.trigger).toBe('scene_transition');
    });

    it('빈 sceneTransition → 감지 안됨', () => {
      const result = detector.detect({
        sceneTransition: {},
        messageCount: 5,
      });
      expect(result.detected).toBe(false);
    });

    it('location_change 상태 변경 감지', () => {
      const result = detector.detect({
        stateChanges: [
          { type: 'location_change', targetCharacterId: 'char-1', value: '숲' },
        ],
        messageCount: 5,
      });
      expect(result.detected).toBe(true);
      expect(result.trigger).toBe('location_change');
    });

    it('combat_end 감지', () => {
      const result = detector.detect({
        combatEnded: true,
        messageCount: 5,
      });
      expect(result.detected).toBe(true);
      expect(result.trigger).toBe('combat_end');
    });

    it('message_threshold 감지 (기본값 40)', () => {
      const result = detector.detect({ messageCount: 40 });
      expect(result.detected).toBe(true);
      expect(result.trigger).toBe('message_threshold');
    });

    it('message_threshold 미만 → 감지 안됨', () => {
      const result = detector.detect({ messageCount: 39 });
      expect(result.detected).toBe(false);
    });

    it('커스텀 messageThreshold', () => {
      const result = detector.detect({ messageCount: 20, messageThreshold: 20 });
      expect(result.detected).toBe(true);
      expect(result.trigger).toBe('message_threshold');
    });

    it('아무것도 감지 안됨 → detected: false', () => {
      const result = detector.detect({ messageCount: 5 });
      expect(result.detected).toBe(false);
      expect(result.trigger).toBeUndefined();
    });

    it('우선순위: sceneTransition > location_change > combat_end > message_threshold', () => {
      // 모든 조건이 동시에 발생 → scene_transition이 우선
      const result = detector.detect({
        sceneTransition: { newLocation: '새 장소' },
        stateChanges: [
          { type: 'location_change', targetCharacterId: 'char-1', value: '다른 곳' },
        ],
        combatEnded: true,
        messageCount: 50,
      });
      expect(result.trigger).toBe('scene_transition');
    });

    it('우선순위: location_change > combat_end (sceneTransition 없을 때)', () => {
      const result = detector.detect({
        stateChanges: [
          { type: 'location_change', targetCharacterId: 'char-1', value: '숲' },
        ],
        combatEnded: true,
        messageCount: 50,
      });
      expect(result.trigger).toBe('location_change');
    });

    it('우선순위: combat_end > message_threshold (다른 조건 없을 때)', () => {
      const result = detector.detect({
        combatEnded: true,
        messageCount: 50,
      });
      expect(result.trigger).toBe('combat_end');
    });
  });
});
