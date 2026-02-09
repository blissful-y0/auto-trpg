// 피해 계산기 — 공격 판정 + 피해 계산 (D&D 5e)

import { DiceEngine } from '../DiceEngine';
import type { AttackResult, DamageInput, DamageType } from './types';

export class DamageCalculator {
  constructor(private diceEngine: DiceEngine) {}

  // 공격 판정 (d20 + modifier vs AC)
  rollAttack(
    attackModifier: number,
    targetAC: number,
    advantage?: boolean, // true=이점, false=불리, undefined=보통
  ): AttackResult {
    let attackRoll: number;

    if (advantage !== undefined) {
      const result = this.diceEngine.rollWithAdvantage('d20', advantage);
      attackRoll = advantage
        ? Math.max(result.rolls[0], result.rolls[1])
        : Math.min(result.rolls[0], result.rolls[1]);
    } else {
      const result = this.diceEngine.roll('d20', 1, 0);
      attackRoll = result.rolls[0];
    }

    const critical = attackRoll === 20;
    const fumble = attackRoll === 1;
    const total = attackRoll + attackModifier;

    // 자연 20 = 자동 명중, 자연 1 = 자동 실패
    const hit = fumble ? false : (critical ? true : total >= targetAC);

    return {
      hit,
      critical,
      fumble,
      attackRoll,
      total,
      targetAC,
    };
  }

  // 피해 계산
  rollDamage(input: DamageInput): { damage: number; rolls: number[]; damageType: DamageType } {
    const result = this.diceEngine.rollNotation(input.damageDice);

    let totalDamage: number;
    let allRolls: number[];

    if (input.isCritical) {
      // 크리티컬: 다이스를 한번 더 굴려서 합산
      const critResult = this.diceEngine.rollNotation(input.damageDice);
      totalDamage = result.rolls.reduce((a, b) => a + b, 0)
        + critResult.rolls.reduce((a, b) => a + b, 0)
        + input.damageModifier;
      allRolls = [...result.rolls, ...critResult.rolls];
    } else {
      totalDamage = result.rolls.reduce((a, b) => a + b, 0) + input.damageModifier;
      allRolls = result.rolls;
    }

    // 피해는 최소 0
    return {
      damage: Math.max(0, totalDamage),
      rolls: allRolls,
      damageType: input.damageType,
    };
  }

  // 공격 + 피해 통합 처리
  resolveAttack(
    attackModifier: number,
    targetAC: number,
    damageInput: DamageInput,
    advantage?: boolean,
  ): AttackResult {
    const attack = this.rollAttack(attackModifier, targetAC, advantage);

    if (attack.hit) {
      const damage = this.rollDamage({
        ...damageInput,
        isCritical: attack.critical,
      });

      attack.damage = damage.damage;
      attack.damageType = damage.damageType;
      attack.damageRolls = damage.rolls;
    }

    return attack;
  }
}
