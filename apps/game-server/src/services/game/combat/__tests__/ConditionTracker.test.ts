import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DiceEngine } from '../../DiceEngine';
import { ConditionTracker } from '../ConditionTracker';
import type { AppliedCondition, AbilityType } from '../types';

describe('ConditionTracker', () => {
  let diceEngine: DiceEngine;
  let tracker: ConditionTracker;

  beforeEach(() => {
    diceEngine = new DiceEngine();
    tracker = new ConditionTracker(diceEngine);
  });

  // ─── addCondition ───────────────────────────────────

  describe('addCondition', () => {
    it('빈 배열에 상태이상 추가', () => {
      const result = tracker.addCondition([], 'blinded', 'spell-1', 3);
      expect(result).toHaveLength(1);
      expect(result[0].condition).toBe('blinded');
      expect(result[0].sourceId).toBe('spell-1');
      expect(result[0].duration).toBe(3);
    });

    it('같은 소스의 같은 상태이상은 갱신', () => {
      const initial: AppliedCondition[] = [
        { condition: 'poisoned', sourceId: 'trap-1', duration: 5 },
      ];
      const result = tracker.addCondition(initial, 'poisoned', 'trap-1', 10);
      expect(result).toHaveLength(1);
      expect(result[0].duration).toBe(10); // 갱신됨
    });

    it('다른 소스의 같은 상태이상은 중복 허용', () => {
      const initial: AppliedCondition[] = [
        { condition: 'charmed', sourceId: 'npc-1', duration: -1 },
      ];
      const result = tracker.addCondition(initial, 'charmed', 'npc-2', 5);
      expect(result).toHaveLength(2);
    });

    it('다른 상태이상 추가', () => {
      const initial: AppliedCondition[] = [
        { condition: 'blinded', sourceId: 'spell-1', duration: 3 },
      ];
      const result = tracker.addCondition(initial, 'prone', 'attack-1', 1);
      expect(result).toHaveLength(2);
      expect(result[1].condition).toBe('prone');
    });

    it('세이빙 스로우 DC와 능력치 포함 추가', () => {
      const result = tracker.addCondition(
        [], 'stunned', 'monster-1', -1, 15, 'constitution',
      );
      expect(result[0].saveDC).toBe(15);
      expect(result[0].saveAbility).toBe('constitution');
      expect(result[0].duration).toBe(-1);
    });
  });

  // ─── removeCondition ────────────────────────────────

  describe('removeCondition', () => {
    it('특정 소스의 상태이상 제거', () => {
      const conditions: AppliedCondition[] = [
        { condition: 'charmed', sourceId: 'npc-1', duration: -1 },
        { condition: 'charmed', sourceId: 'npc-2', duration: 3 },
      ];
      const result = tracker.removeCondition(conditions, 'charmed', 'npc-1');
      expect(result).toHaveLength(1);
      expect(result[0].sourceId).toBe('npc-2');
    });

    it('소스 미지정 시 해당 상태이상 전부 제거', () => {
      const conditions: AppliedCondition[] = [
        { condition: 'charmed', sourceId: 'npc-1', duration: -1 },
        { condition: 'charmed', sourceId: 'npc-2', duration: 3 },
        { condition: 'blinded', sourceId: 'spell-1', duration: 2 },
      ];
      const result = tracker.removeCondition(conditions, 'charmed');
      expect(result).toHaveLength(1);
      expect(result[0].condition).toBe('blinded');
    });

    it('존재하지 않는 상태이상 제거 시 변동 없음', () => {
      const conditions: AppliedCondition[] = [
        { condition: 'blinded', sourceId: 'spell-1', duration: 2 },
      ];
      const result = tracker.removeCondition(conditions, 'prone');
      expect(result).toHaveLength(1);
    });
  });

  // ─── processStartOfTurn ─────────────────────────────

  describe('processStartOfTurn', () => {
    it('duration 감소', () => {
      const conditions: AppliedCondition[] = [
        { condition: 'blinded', sourceId: 'spell-1', duration: 3 },
      ];
      const result = tracker.processStartOfTurn(conditions);
      expect(result.conditions).toHaveLength(1);
      expect(result.conditions[0].duration).toBe(2);
      expect(result.expired).toHaveLength(0);
    });

    it('duration 0이면 만료 제거', () => {
      const conditions: AppliedCondition[] = [
        { condition: 'prone', sourceId: 'attack-1', duration: 0 },
        { condition: 'blinded', sourceId: 'spell-1', duration: 2 },
      ];
      const result = tracker.processStartOfTurn(conditions);
      expect(result.conditions).toHaveLength(1);
      expect(result.conditions[0].condition).toBe('blinded');
      expect(result.expired).toContain('prone');
    });

    it('영구 상태이상 (-1)은 유지', () => {
      const conditions: AppliedCondition[] = [
        { condition: 'petrified', sourceId: 'curse-1', duration: -1 },
      ];
      const result = tracker.processStartOfTurn(conditions);
      expect(result.conditions).toHaveLength(1);
      expect(result.conditions[0].duration).toBe(-1);
      expect(result.expired).toHaveLength(0);
    });

    it('여러 상태이상 동시 처리', () => {
      const conditions: AppliedCondition[] = [
        { condition: 'blinded', sourceId: 's1', duration: 0 },  // 만료
        { condition: 'prone', sourceId: 's2', duration: 1 },    // 0으로 감소
        { condition: 'stunned', sourceId: 's3', duration: -1 }, // 유지
      ];
      const result = tracker.processStartOfTurn(conditions);
      expect(result.conditions).toHaveLength(2);
      expect(result.expired).toContain('blinded');
      expect(result.conditions[0].duration).toBe(0); // prone
      expect(result.conditions[1].duration).toBe(-1); // stunned
    });
  });

  // ─── processEndOfTurn ───────────────────────────────

  describe('processEndOfTurn', () => {
    const abilities: Record<AbilityType, number> = {
      strength: 14,
      dexterity: 12,
      constitution: 16,
      intelligence: 10,
      wisdom: 13,
      charisma: 8,
    };

    it('세이빙 스로우 성공 시 상태이상 해제', () => {
      // 능력치 16(con) 수정치 +3, 숙련 +2 = +5, DC 12
      // d20 결과 10 → 10+5 = 15 >= 12 → 성공
      vi.spyOn(diceEngine, 'skillCheck').mockReturnValueOnce({
        dice: 'd20', count: 1, modifier: 5, rolls: [10], total: 15,
      });

      const conditions: AppliedCondition[] = [
        {
          condition: 'poisoned',
          sourceId: 'trap-1',
          duration: -1,
          saveDC: 12,
          saveAbility: 'constitution',
        },
      ];

      const result = tracker.processEndOfTurn(conditions, abilities, 2);
      expect(result.saved).toContain('poisoned');
      expect(result.conditions).toHaveLength(0);
    });

    it('세이빙 스로우 실패 시 상태이상 유지', () => {
      vi.spyOn(diceEngine, 'skillCheck').mockReturnValueOnce({
        dice: 'd20', count: 1, modifier: 5, rolls: [3], total: 8,
      });

      const conditions: AppliedCondition[] = [
        {
          condition: 'stunned',
          sourceId: 'monster-1',
          duration: -1,
          saveDC: 15,
          saveAbility: 'wisdom',
        },
      ];

      const result = tracker.processEndOfTurn(conditions, abilities, 2);
      expect(result.failed).toContain('stunned');
      expect(result.conditions).toHaveLength(1);
    });

    it('DC 없는 영구 상태이상은 세이빙 스로우 안 함', () => {
      const conditions: AppliedCondition[] = [
        { condition: 'unconscious', sourceId: 'system', duration: -1 },
      ];

      const result = tracker.processEndOfTurn(conditions, abilities);
      expect(result.saved).toHaveLength(0);
      expect(result.failed).toHaveLength(0);
      expect(result.conditions).toHaveLength(1);
    });

    it('기간 제한 상태이상 (duration > 0)은 세이빙 스로우 안 함', () => {
      const conditions: AppliedCondition[] = [
        {
          condition: 'blinded',
          sourceId: 'spell-1',
          duration: 3,
          saveDC: 15,
          saveAbility: 'constitution',
        },
      ];

      const result = tracker.processEndOfTurn(conditions, abilities);
      // duration이 -1이 아니므로 세이빙 스로우 안 함
      expect(result.saved).toHaveLength(0);
      expect(result.conditions).toHaveLength(1);
    });
  });

  // ─── hasCondition / getActiveConditions ─────────────

  describe('hasCondition', () => {
    it('상태이상 보유 확인', () => {
      const conditions: AppliedCondition[] = [
        { condition: 'blinded', sourceId: 's1', duration: 3 },
      ];
      expect(tracker.hasCondition(conditions, 'blinded')).toBe(true);
      expect(tracker.hasCondition(conditions, 'prone')).toBe(false);
    });
  });

  describe('getActiveConditions', () => {
    it('중복 제거된 활성 상태이상 목록 반환', () => {
      const conditions: AppliedCondition[] = [
        { condition: 'blinded', sourceId: 's1', duration: 3 },
        { condition: 'blinded', sourceId: 's2', duration: 1 },
        { condition: 'prone', sourceId: 's3', duration: 1 },
      ];
      const active = tracker.getActiveConditions(conditions);
      expect(active).toHaveLength(2);
      expect(active).toContain('blinded');
      expect(active).toContain('prone');
    });
  });

  // ─── getAttackAdvantage ─────────────────────────────

  describe('getAttackAdvantage', () => {
    it('투명 공격자 → 이점', () => {
      const attacker: AppliedCondition[] = [
        { condition: 'invisible', sourceId: 's1', duration: -1 },
      ];
      expect(tracker.getAttackAdvantage(attacker, [])).toBe(true);
    });

    it('실명 공격자 → 불리', () => {
      const attacker: AppliedCondition[] = [
        { condition: 'blinded', sourceId: 's1', duration: 3 },
      ];
      expect(tracker.getAttackAdvantage(attacker, [])).toBe(false);
    });

    it('마비된 대상 → 이점', () => {
      const target: AppliedCondition[] = [
        { condition: 'paralyzed', sourceId: 's1', duration: -1 },
      ];
      expect(tracker.getAttackAdvantage([], target)).toBe(true);
    });

    it('투명한 대상 → 불리', () => {
      const target: AppliedCondition[] = [
        { condition: 'invisible', sourceId: 's1', duration: -1 },
      ];
      expect(tracker.getAttackAdvantage([], target)).toBe(false);
    });

    it('이점과 불리 상쇄 → undefined', () => {
      // 공격자 투명 (이점) + 공격자 실명 (불리) → 상쇄
      const attacker: AppliedCondition[] = [
        { condition: 'invisible', sourceId: 's1', duration: -1 },
        { condition: 'blinded', sourceId: 's2', duration: 3 },
      ];
      expect(tracker.getAttackAdvantage(attacker, [])).toBeUndefined();
    });

    it('상태이상 없으면 undefined', () => {
      expect(tracker.getAttackAdvantage([], [])).toBeUndefined();
    });
  });

  // ─── isIncapacitated ────────────────────────────────

  describe('isIncapacitated', () => {
    it('incapacitated → 행동 불가', () => {
      const conds: AppliedCondition[] = [
        { condition: 'incapacitated', sourceId: 's1', duration: -1 },
      ];
      expect(tracker.isIncapacitated(conds)).toBe(true);
    });

    it('paralyzed → 행동 불가', () => {
      const conds: AppliedCondition[] = [
        { condition: 'paralyzed', sourceId: 's1', duration: -1 },
      ];
      expect(tracker.isIncapacitated(conds)).toBe(true);
    });

    it('stunned → 행동 불가', () => {
      const conds: AppliedCondition[] = [
        { condition: 'stunned', sourceId: 's1', duration: 2 },
      ];
      expect(tracker.isIncapacitated(conds)).toBe(true);
    });

    it('unconscious → 행동 불가', () => {
      const conds: AppliedCondition[] = [
        { condition: 'unconscious', sourceId: 'system', duration: -1 },
      ];
      expect(tracker.isIncapacitated(conds)).toBe(true);
    });

    it('petrified → 행동 불가', () => {
      const conds: AppliedCondition[] = [
        { condition: 'petrified', sourceId: 's1', duration: -1 },
      ];
      expect(tracker.isIncapacitated(conds)).toBe(true);
    });

    it('blinded → 행동 가능', () => {
      const conds: AppliedCondition[] = [
        { condition: 'blinded', sourceId: 's1', duration: 3 },
      ];
      expect(tracker.isIncapacitated(conds)).toBe(false);
    });

    it('빈 배열 → 행동 가능', () => {
      expect(tracker.isIncapacitated([])).toBe(false);
    });
  });

  // ─── serialize / deserialize ────────────────────────

  describe('serialize / deserialize', () => {
    it('직렬화 후 역직렬화 시 동일한 결과', () => {
      const conditions: AppliedCondition[] = [
        { condition: 'blinded', sourceId: 'spell-1', duration: 3 },
        { condition: 'poisoned', sourceId: 'trap-1', duration: -1, saveDC: 15, saveAbility: 'constitution' },
      ];

      const serialized = tracker.serialize(conditions);
      const deserialized = tracker.deserialize(serialized);
      expect(deserialized).toEqual(conditions);
    });

    it('빈 배열 직렬화', () => {
      const serialized = tracker.serialize([]);
      const deserialized = tracker.deserialize(serialized);
      expect(deserialized).toEqual([]);
    });
  });
});
