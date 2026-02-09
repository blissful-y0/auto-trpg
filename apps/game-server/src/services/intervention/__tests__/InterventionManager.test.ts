import { describe, it, expect, vi } from 'vitest';
import { InterventionManager } from '../InterventionManager';
import { InterventionRules } from '../InterventionRules';
import { InterventionClassifier } from '../InterventionClassifier';
import type { InterventionInput, InterventionDecision } from '../types';

// InterventionRules 모킹
function createMockRules(overrides?: Partial<InterventionRules>): InterventionRules {
  return {
    evaluate: vi.fn(),
    ...overrides,
  } as unknown as InterventionRules;
}

// InterventionClassifier 모킹
function createMockClassifier(decision?: InterventionDecision): InterventionClassifier {
  return {
    classify: vi.fn().mockResolvedValue(
      decision ?? {
        shouldIntervene: true,
        reason: 'LLM 판단',
        urgency: 'after_rp',
        interventionType: 'narration',
      },
    ),
  } as unknown as InterventionClassifier;
}

describe('InterventionManager', () => {
  const baseInput: InterventionInput = {
    sessionId: 'session-1',
    characterId: 'char-1',
    userId: 'user-1',
    message: '테스트 메시지',
    isOOC: false,
    aggressiveness: 'balanced',
  };

  describe('규칙 필터 결과 전달', () => {
    it('bypass → shouldIntervene=true 즉시 반환', async () => {
      const bypassDecision: InterventionDecision = {
        shouldIntervene: true,
        reason: 'GM 멘션',
        urgency: 'immediate',
        interventionType: 'narration',
      };

      const rules = createMockRules({
        evaluate: vi.fn().mockReturnValue({ result: 'bypass', decision: bypassDecision }),
      });
      const classifier = createMockClassifier();
      const manager = new InterventionManager(rules, classifier);

      const result = await manager.evaluate({ ...baseInput, message: '@GM 도와줘' });

      expect(result.shouldIntervene).toBe(true);
      expect(result.urgency).toBe('immediate');
      // classifier는 호출되지 않아야 함
      expect(classifier.classify).not.toHaveBeenCalled();
    });

    it('pass → shouldIntervene=false 즉시 반환', async () => {
      const passDecision: InterventionDecision = {
        shouldIntervene: false,
        reason: 'OOC 메시지',
        urgency: 'none',
        interventionType: 'narration',
      };

      const rules = createMockRules({
        evaluate: vi.fn().mockReturnValue({ result: 'pass', decision: passDecision }),
      });
      const classifier = createMockClassifier();
      const manager = new InterventionManager(rules, classifier);

      const result = await manager.evaluate({ ...baseInput, isOOC: true });

      expect(result.shouldIntervene).toBe(false);
      expect(result.urgency).toBe('none');
      // classifier는 호출되지 않아야 함
      expect(classifier.classify).not.toHaveBeenCalled();
    });

    it('classify → LLM 결과 반환', async () => {
      const rules = createMockRules({
        evaluate: vi.fn().mockReturnValue({ result: 'classify' }),
      });
      const llmDecision: InterventionDecision = {
        shouldIntervene: true,
        reason: 'LLM이 개입 필요하다고 판단',
        urgency: 'after_rp',
        interventionType: 'environment',
      };
      const classifier = createMockClassifier(llmDecision);
      const manager = new InterventionManager(rules, classifier);

      const result = await manager.evaluate(baseInput);

      expect(result.shouldIntervene).toBe(true);
      expect(result.interventionType).toBe('environment');
      expect(classifier.classify).toHaveBeenCalledOnce();
    });
  });

  describe('aggressiveness 보정', () => {
    it('balanced → urgency 변경 없음', async () => {
      const rules = createMockRules({
        evaluate: vi.fn().mockReturnValue({ result: 'classify' }),
      });
      const classifier = createMockClassifier({
        shouldIntervene: true,
        reason: '테스트',
        urgency: 'after_rp',
        interventionType: 'narration',
      });
      const manager = new InterventionManager(rules, classifier);

      const result = await manager.evaluate({ ...baseInput, aggressiveness: 'balanced' });

      expect(result.urgency).toBe('after_rp');
    });

    it('passive → background가 none으로 하향', async () => {
      const rules = createMockRules({
        evaluate: vi.fn().mockReturnValue({ result: 'classify' }),
      });
      const classifier = createMockClassifier({
        shouldIntervene: true,
        reason: '테스트',
        urgency: 'background',
        interventionType: 'narration',
      });
      const manager = new InterventionManager(rules, classifier);

      const result = await manager.evaluate({ ...baseInput, aggressiveness: 'passive' });

      expect(result.urgency).toBe('none');
      expect(result.shouldIntervene).toBe(false); // none이면 개입하지 않음
    });

    it('passive → after_rp가 background로 하향', async () => {
      const rules = createMockRules({
        evaluate: vi.fn().mockReturnValue({ result: 'classify' }),
      });
      const classifier = createMockClassifier({
        shouldIntervene: true,
        reason: '테스트',
        urgency: 'after_rp',
        interventionType: 'narration',
      });
      const manager = new InterventionManager(rules, classifier);

      const result = await manager.evaluate({ ...baseInput, aggressiveness: 'passive' });

      expect(result.urgency).toBe('background');
    });

    it('active → background가 after_rp로 상향', async () => {
      const rules = createMockRules({
        evaluate: vi.fn().mockReturnValue({ result: 'classify' }),
      });
      const classifier = createMockClassifier({
        shouldIntervene: true,
        reason: '테스트',
        urgency: 'background',
        interventionType: 'narration',
      });
      const manager = new InterventionManager(rules, classifier);

      const result = await manager.evaluate({ ...baseInput, aggressiveness: 'active' });

      expect(result.urgency).toBe('after_rp');
    });

    it('active → after_rp가 immediate로 상향', async () => {
      const rules = createMockRules({
        evaluate: vi.fn().mockReturnValue({ result: 'classify' }),
      });
      const classifier = createMockClassifier({
        shouldIntervene: true,
        reason: '테스트',
        urgency: 'after_rp',
        interventionType: 'narration',
      });
      const manager = new InterventionManager(rules, classifier);

      const result = await manager.evaluate({ ...baseInput, aggressiveness: 'active' });

      expect(result.urgency).toBe('immediate');
    });
  });
});
