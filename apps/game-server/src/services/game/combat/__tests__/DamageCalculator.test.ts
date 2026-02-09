import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DiceEngine } from '../../DiceEngine';
import { DamageCalculator } from '../DamageCalculator';
import type { DamageInput } from '../types';

describe('DamageCalculator', () => {
  let diceEngine: DiceEngine;
  let calc: DamageCalculator;

  beforeEach(() => {
    diceEngine = new DiceEngine();
    calc = new DamageCalculator(diceEngine);
  });

  // ─── rollAttack ─────────────────────────────────────

  describe('rollAttack', () => {
    it('명중 — d20 + 수정치 >= AC', () => {
      // d20 결과 15, 수정치 +5 = 20 vs AC 18 → 명중
      vi.spyOn(diceEngine, 'roll').mockReturnValueOnce({
        dice: 'd20', count: 1, modifier: 0, rolls: [15], total: 15,
      });

      const result = calc.rollAttack(5, 18);
      expect(result.hit).toBe(true);
      expect(result.critical).toBe(false);
      expect(result.fumble).toBe(false);
      expect(result.attackRoll).toBe(15);
      expect(result.total).toBe(20);
      expect(result.targetAC).toBe(18);
    });

    it('빗나감 — d20 + 수정치 < AC', () => {
      // d20 결과 5, 수정치 +3 = 8 vs AC 15 → 빗나감
      vi.spyOn(diceEngine, 'roll').mockReturnValueOnce({
        dice: 'd20', count: 1, modifier: 0, rolls: [5], total: 5,
      });

      const result = calc.rollAttack(3, 15);
      expect(result.hit).toBe(false);
      expect(result.critical).toBe(false);
      expect(result.fumble).toBe(false);
      expect(result.total).toBe(8);
    });

    it('크리티컬 (자연 20) — 자동 명중', () => {
      vi.spyOn(diceEngine, 'roll').mockReturnValueOnce({
        dice: 'd20', count: 1, modifier: 0, rolls: [20], total: 20,
      });

      const result = calc.rollAttack(0, 30); // AC 30이어도 명중
      expect(result.hit).toBe(true);
      expect(result.critical).toBe(true);
      expect(result.fumble).toBe(false);
      expect(result.attackRoll).toBe(20);
    });

    it('펌블 (자연 1) — 자동 실패', () => {
      vi.spyOn(diceEngine, 'roll').mockReturnValueOnce({
        dice: 'd20', count: 1, modifier: 0, rolls: [1], total: 1,
      });

      const result = calc.rollAttack(20, 5); // 수정치 +20이어도 실패
      expect(result.hit).toBe(false);
      expect(result.critical).toBe(false);
      expect(result.fumble).toBe(true);
      expect(result.attackRoll).toBe(1);
    });

    it('이점(advantage) — 2회 굴림 중 높은 값 사용', () => {
      vi.spyOn(diceEngine, 'rollWithAdvantage').mockReturnValueOnce({
        dice: 'd20', count: 1, modifier: 0, rolls: [8, 15], total: 15,
      });

      const result = calc.rollAttack(3, 15, true);
      expect(result.hit).toBe(true);
      expect(result.attackRoll).toBe(15); // Math.max(8, 15)
      expect(result.total).toBe(18);
    });

    it('불리(disadvantage) — 2회 굴림 중 낮은 값 사용', () => {
      vi.spyOn(diceEngine, 'rollWithAdvantage').mockReturnValueOnce({
        dice: 'd20', count: 1, modifier: 0, rolls: [18, 7], total: 7,
      });

      const result = calc.rollAttack(3, 15, false);
      expect(result.hit).toBe(false);
      expect(result.attackRoll).toBe(7); // Math.min(18, 7)
      expect(result.total).toBe(10);
    });

    it('정확히 AC와 같으면 명중', () => {
      vi.spyOn(diceEngine, 'roll').mockReturnValueOnce({
        dice: 'd20', count: 1, modifier: 0, rolls: [12], total: 12,
      });

      const result = calc.rollAttack(3, 15); // 12 + 3 = 15 vs AC 15
      expect(result.hit).toBe(true);
    });
  });

  // ─── rollDamage ─────────────────────────────────────

  describe('rollDamage', () => {
    it('일반 피해 계산 (1d8+3)', () => {
      vi.spyOn(diceEngine, 'rollNotation').mockReturnValueOnce({
        dice: 'd8', count: 1, modifier: 0, rolls: [6], total: 6,
      });

      const input: DamageInput = {
        damageDice: '1d8',
        damageModifier: 3,
        damageType: 'slashing',
        isCritical: false,
      };

      const result = calc.rollDamage(input);
      expect(result.damage).toBe(9); // 6 + 3
      expect(result.damageType).toBe('slashing');
      expect(result.rolls).toEqual([6]);
    });

    it('크리티컬 피해 — 다이스 2배', () => {
      vi.spyOn(diceEngine, 'rollNotation')
        .mockReturnValueOnce({
          dice: 'd8', count: 1, modifier: 0, rolls: [6], total: 6,
        })
        .mockReturnValueOnce({
          dice: 'd8', count: 1, modifier: 0, rolls: [4], total: 4,
        });

      const input: DamageInput = {
        damageDice: '1d8',
        damageModifier: 3,
        damageType: 'fire',
        isCritical: true,
      };

      const result = calc.rollDamage(input);
      expect(result.damage).toBe(13); // 6 + 4 + 3
      expect(result.rolls).toEqual([6, 4]);
      expect(result.damageType).toBe('fire');
    });

    it('피해 최소값 0 (음수 수정치)', () => {
      vi.spyOn(diceEngine, 'rollNotation').mockReturnValueOnce({
        dice: 'd4', count: 1, modifier: 0, rolls: [1], total: 1,
      });

      const input: DamageInput = {
        damageDice: '1d4',
        damageModifier: -5,
        damageType: 'bludgeoning',
        isCritical: false,
      };

      const result = calc.rollDamage(input);
      expect(result.damage).toBe(0); // 1 + (-5) = -4 → 0
    });

    it('2d6 피해 계산', () => {
      vi.spyOn(diceEngine, 'rollNotation').mockReturnValueOnce({
        dice: 'd6', count: 2, modifier: 0, rolls: [3, 5], total: 8,
      });

      const input: DamageInput = {
        damageDice: '2d6',
        damageModifier: 4,
        damageType: 'piercing',
        isCritical: false,
      };

      const result = calc.rollDamage(input);
      expect(result.damage).toBe(12); // 3 + 5 + 4
      expect(result.rolls).toEqual([3, 5]);
    });
  });

  // ─── resolveAttack ──────────────────────────────────

  describe('resolveAttack', () => {
    it('명중 시 피해 포함', () => {
      // 공격 굴림: 15
      vi.spyOn(diceEngine, 'roll').mockReturnValueOnce({
        dice: 'd20', count: 1, modifier: 0, rolls: [15], total: 15,
      });
      // 피해 굴림: 6
      vi.spyOn(diceEngine, 'rollNotation').mockReturnValueOnce({
        dice: 'd8', count: 1, modifier: 0, rolls: [6], total: 6,
      });

      const damageInput: DamageInput = {
        damageDice: '1d8',
        damageModifier: 3,
        damageType: 'slashing',
        isCritical: false,
      };

      const result = calc.resolveAttack(5, 18, damageInput);
      expect(result.hit).toBe(true);
      expect(result.damage).toBe(9); // 6 + 3
      expect(result.damageType).toBe('slashing');
      expect(result.damageRolls).toEqual([6]);
    });

    it('빗나감 시 피해 없음', () => {
      vi.spyOn(diceEngine, 'roll').mockReturnValueOnce({
        dice: 'd20', count: 1, modifier: 0, rolls: [3], total: 3,
      });

      const damageInput: DamageInput = {
        damageDice: '1d8',
        damageModifier: 3,
        damageType: 'slashing',
        isCritical: false,
      };

      const result = calc.resolveAttack(2, 15, damageInput);
      expect(result.hit).toBe(false);
      expect(result.damage).toBeUndefined();
      expect(result.damageType).toBeUndefined();
      expect(result.damageRolls).toBeUndefined();
    });

    it('크리티컬 시 피해 다이스 2배', () => {
      // 공격 굴림: 자연 20
      vi.spyOn(diceEngine, 'roll').mockReturnValueOnce({
        dice: 'd20', count: 1, modifier: 0, rolls: [20], total: 20,
      });
      // 피해 굴림: 첫 번째 + 크리티컬 추가
      vi.spyOn(diceEngine, 'rollNotation')
        .mockReturnValueOnce({
          dice: 'd8', count: 1, modifier: 0, rolls: [5], total: 5,
        })
        .mockReturnValueOnce({
          dice: 'd8', count: 1, modifier: 0, rolls: [7], total: 7,
        });

      const damageInput: DamageInput = {
        damageDice: '1d8',
        damageModifier: 3,
        damageType: 'piercing',
        isCritical: false,
      };

      const result = calc.resolveAttack(5, 25, damageInput);
      expect(result.hit).toBe(true);
      expect(result.critical).toBe(true);
      expect(result.damage).toBe(15); // 5 + 7 + 3
      expect(result.damageRolls).toEqual([5, 7]);
    });

    it('이점 포함 공격 통합', () => {
      vi.spyOn(diceEngine, 'rollWithAdvantage').mockReturnValueOnce({
        dice: 'd20', count: 1, modifier: 0, rolls: [6, 17], total: 17,
      });
      vi.spyOn(diceEngine, 'rollNotation').mockReturnValueOnce({
        dice: 'd6', count: 2, modifier: 0, rolls: [4, 3], total: 7,
      });

      const damageInput: DamageInput = {
        damageDice: '2d6',
        damageModifier: 4,
        damageType: 'fire',
        isCritical: false,
      };

      const result = calc.resolveAttack(3, 18, damageInput, true);
      expect(result.hit).toBe(true);
      expect(result.attackRoll).toBe(17);
      expect(result.total).toBe(20);
      expect(result.damage).toBe(11); // 4 + 3 + 4
    });
  });
});
