import { describe, it, expect, beforeEach } from 'vitest';
import { InterventionRules } from '../InterventionRules';
import type { InterventionInput } from '../types';

describe('InterventionRules', () => {
  let rules: InterventionRules;

  // 기본 입력 템플릿
  const baseInput: InterventionInput = {
    sessionId: 'session-1',
    characterId: 'char-1',
    userId: 'user-1',
    message: '',
    isOOC: false,
    aggressiveness: 'balanced',
  };

  beforeEach(() => {
    rules = new InterventionRules();
  });

  describe('Bypass 조건 (즉시 개입)', () => {
    it('@GM 멘션 → bypass (narration)', () => {
      const result = rules.evaluate({ ...baseInput, message: '@GM 이 던전에 뭐가 있어?' });
      expect(result.result).toBe('bypass');
      expect(result.decision?.shouldIntervene).toBe(true);
      expect(result.decision?.interventionType).toBe('narration');
    });

    it('@gm 소문자 멘션 → bypass', () => {
      const result = rules.evaluate({ ...baseInput, message: '@gm 도와줘' });
      expect(result.result).toBe('bypass');
      expect(result.decision?.shouldIntervene).toBe(true);
    });

    it('전투 중 공격 키워드 → bypass (rule_check)', () => {
      const result = rules.evaluate({
        ...baseInput,
        message: '고블린을 공격한다',
        combatActive: true,
      });
      expect(result.result).toBe('bypass');
      expect(result.decision?.shouldIntervene).toBe(true);
      expect(result.decision?.interventionType).toBe('rule_check');
    });

    it('전투 비활성 시 공격 키워드 → bypass 아님', () => {
      const result = rules.evaluate({
        ...baseInput,
        message: '고블린을 공격한다',
        combatActive: false,
      });
      // 전투가 비활성이면 전투 bypass가 아닌 다른 규칙으로 판단
      expect(result.result).not.toBe('bypass');
    });

    it('주사위 요청 (d20) → bypass (rule_check)', () => {
      const result = rules.evaluate({ ...baseInput, message: 'd20 굴려줘' });
      expect(result.result).toBe('bypass');
      expect(result.decision?.interventionType).toBe('rule_check');
    });

    it('주사위 요청 (판정) → bypass (rule_check)', () => {
      const result = rules.evaluate({ ...baseInput, message: '은신 판정을 한다' });
      expect(result.result).toBe('bypass');
      expect(result.decision?.interventionType).toBe('rule_check');
    });

    it('NPC에게 말걸기 → bypass (npc_response)', () => {
      const result = rules.evaluate({ ...baseInput, message: '상인에게 물건을 보여달라고 한다' });
      expect(result.result).toBe('bypass');
      expect(result.decision?.interventionType).toBe('npc_response');
    });

    it('NPC한테 말걸기 → bypass (npc_response)', () => {
      const result = rules.evaluate({ ...baseInput, message: '경비병한테 통과시켜달라고 한다' });
      expect(result.result).toBe('bypass');
      expect(result.decision?.interventionType).toBe('npc_response');
    });

    it('질문 패턴 (물음표) → bypass (narration)', () => {
      const result = rules.evaluate({ ...baseInput, message: '이 동굴에 뭐가 있지?' });
      expect(result.result).toBe('bypass');
      expect(result.decision?.interventionType).toBe('narration');
    });

    it('질문 패턴 (어떻게) → bypass (narration)', () => {
      const result = rules.evaluate({ ...baseInput, message: '어떻게 문을 열 수 있을까' });
      expect(result.result).toBe('bypass');
      expect(result.decision?.interventionType).toBe('narration');
    });
  });

  describe('Pass 조건 (무시)', () => {
    it('isOOC=true → pass', () => {
      const result = rules.evaluate({ ...baseInput, message: '잠깐 화장실 갔다올게', isOOC: true });
      expect(result.result).toBe('pass');
      expect(result.decision?.shouldIntervene).toBe(false);
    });

    it('[OOC] prefix → pass', () => {
      const result = rules.evaluate({ ...baseInput, message: '[OOC] 잠깐 쉬자' });
      expect(result.result).toBe('pass');
      expect(result.decision?.shouldIntervene).toBe(false);
    });

    it('/me 이모트 → pass', () => {
      const result = rules.evaluate({ ...baseInput, message: '/me 조용히 앉아있다' });
      expect(result.result).toBe('pass');
      expect(result.decision?.shouldIntervene).toBe(false);
    });

    it('*동작* 이모트 → pass', () => {
      const result = rules.evaluate({ ...baseInput, message: '*조용히 고개를 끄덕인다*' });
      expect(result.result).toBe('pass');
      expect(result.decision?.shouldIntervene).toBe(false);
    });

    it('PC간 대화 (따옴표) → pass', () => {
      const result = rules.evaluate({ ...baseInput, message: '"같이 가자"' });
      expect(result.result).toBe('pass');
      expect(result.decision?.shouldIntervene).toBe(false);
    });
  });

  describe('Classify 조건 (2단계로)', () => {
    it('일반 행동 묘사 → classify', () => {
      const result = rules.evaluate({ ...baseInput, message: '조심스럽게 앞으로 걸어간다' });
      expect(result.result).toBe('classify');
      expect(result.decision).toBeUndefined();
    });

    it('모호한 메시지 → classify', () => {
      const result = rules.evaluate({ ...baseInput, message: '주변을 경계하며 대기한다' });
      expect(result.result).toBe('classify');
    });
  });
});
