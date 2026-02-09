// 주사위 엔진 — D&D 5e 스타일 주사위 굴림 처리

export type DiceType = 'd4' | 'd6' | 'd8' | 'd10' | 'd12' | 'd20' | 'd100';

export interface DiceRollResult {
  dice: DiceType;
  count: number;
  modifier: number;
  rolls: number[];
  total: number;
  isCritical?: boolean;
  isFumble?: boolean;
}

export interface SkillCheckResult extends DiceRollResult {
  dc?: number;
  success?: boolean;
}

// 주사위 최대값 매핑
const DICE_MAX: Record<DiceType, number> = {
  d4: 4,
  d6: 6,
  d8: 8,
  d10: 10,
  d12: 12,
  d20: 20,
  d100: 100,
};

// 주사위 표기법 파싱 정규식 (예: "2d6+3", "1d20-1", "4d6")
const NOTATION_REGEX = /^(\d+)?d(\d+)([+-]\d+)?$/i;

export class DiceEngine {
  // 단일 주사위 굴림 (1 ~ max)
  private rollSingle(max: number): number {
    return Math.floor(Math.random() * max) + 1;
  }

  // 주사위 굴리기
  roll(dice: DiceType, count: number = 1, modifier: number = 0): DiceRollResult {
    const max = DICE_MAX[dice];
    const rolls: number[] = [];

    for (let i = 0; i < count; i++) {
      rolls.push(this.rollSingle(max));
    }

    const sum = rolls.reduce((a, b) => a + b, 0);
    const result: DiceRollResult = {
      dice,
      count,
      modifier,
      rolls,
      total: sum + modifier,
    };

    // d20 크리티컬/펌블 판정 (단일 d20만)
    if (dice === 'd20' && count === 1) {
      if (rolls[0] === 20) result.isCritical = true;
      if (rolls[0] === 1) result.isFumble = true;
    }

    return result;
  }

  // 이점(Advantage) / 불리(Disadvantage) 주사위
  rollWithAdvantage(dice: DiceType, advantage: boolean): DiceRollResult {
    const max = DICE_MAX[dice];
    const roll1 = this.rollSingle(max);
    const roll2 = this.rollSingle(max);

    const chosen = advantage ? Math.max(roll1, roll2) : Math.min(roll1, roll2);

    const result: DiceRollResult = {
      dice,
      count: 1,
      modifier: 0,
      rolls: [roll1, roll2],
      total: chosen,
    };

    if (dice === 'd20') {
      if (chosen === 20) result.isCritical = true;
      if (chosen === 1) result.isFumble = true;
    }

    return result;
  }

  // 주사위 표기법 파싱 후 굴림 (예: "2d6+3")
  rollNotation(notation: string): DiceRollResult {
    const match = notation.trim().match(NOTATION_REGEX);
    if (!match) {
      throw new Error(`잘못된 주사위 표기법: "${notation}"`);
    }

    const count = match[1] ? parseInt(match[1], 10) : 1;
    const sides = parseInt(match[2], 10);
    const modifier = match[3] ? parseInt(match[3], 10) : 0;

    // sides를 DiceType으로 변환
    const diceKey = `d${sides}` as DiceType;
    if (!(diceKey in DICE_MAX)) {
      throw new Error(`지원하지 않는 주사위: d${sides}`);
    }

    return this.roll(diceKey, count, modifier);
  }

  // 능력치 수정치 계산 (D&D 5e: (score - 10) / 2 내림)
  getModifier(score: number): number {
    return Math.floor((score - 10) / 2);
  }

  // 스킬 체크 / 세이빙 스로우
  skillCheck(
    score: number,
    proficiencyBonus: number = 0,
    advantage?: boolean,
  ): SkillCheckResult {
    const modifier = this.getModifier(score) + proficiencyBonus;

    let baseResult: DiceRollResult;
    if (advantage !== undefined) {
      baseResult = this.rollWithAdvantage('d20', advantage);
      baseResult.modifier = modifier;
      baseResult.total =
        (advantage
          ? Math.max(baseResult.rolls[0], baseResult.rolls[1])
          : Math.min(baseResult.rolls[0], baseResult.rolls[1])) + modifier;
    } else {
      baseResult = this.roll('d20', 1, modifier);
    }

    return {
      ...baseResult,
    };
  }
}
