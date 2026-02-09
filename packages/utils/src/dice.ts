// 주사위 파싱 및 굴림 유틸리티

import type { DiceType, DiceRoll, AdvantageType } from '@auto-trpg/shared-types';

/** 주사위 표기법 파싱 결과 */
export interface ParsedDice {
  count: number;
  dice: DiceType;
  modifier: number;
}

/** 유효한 주사위 면 수 */
const VALID_DICE_SIDES = new Set([4, 6, 8, 10, 12, 20, 100]);

/**
 * 주사위 표기법 파싱 ("2d6+3", "d20-1", "3d8" 등)
 *
 * 지원 형식:
 * - "d20"     → 1d20+0
 * - "2d6"     → 2d6+0
 * - "2d6+3"   → 2d6+3
 * - "d20-1"   → 1d20-1
 */
export function parseDiceNotation(notation: string): ParsedDice {
  const normalized = notation.trim().toLowerCase();
  const match = normalized.match(/^(\d*)d(\d+)([+-]\d+)?$/);

  if (!match) {
    throw new Error(`잘못된 주사위 표기법: "${notation}"`);
  }

  const count = match[1] ? parseInt(match[1], 10) : 1;
  const sides = parseInt(match[2], 10);
  const modifier = match[3] ? parseInt(match[3], 10) : 0;

  if (!VALID_DICE_SIDES.has(sides)) {
    throw new Error(`지원하지 않는 주사위: d${sides} (지원: d4, d6, d8, d10, d12, d20, d100)`);
  }

  if (count < 1 || count > 100) {
    throw new Error(`주사위 개수는 1~100 사이여야 합니다: ${count}`);
  }

  return {
    count,
    dice: `d${sides}` as DiceType,
    modifier,
  };
}

/**
 * 단일 주사위 굴림 (1~sides 범위의 난수)
 */
function rollSingle(sides: number): number {
  return Math.floor(Math.random() * sides) + 1;
}

/**
 * 주사위 면 수 추출
 */
function getDiceSides(dice: DiceType): number {
  return parseInt(dice.slice(1), 10);
}

/**
 * 주사위 굴림 실행
 *
 * @param dice - 주사위 종류
 * @param count - 주사위 개수
 * @param modifier - 보정치
 * @param advantageType - 이점/불리 (d20 단일 굴림에만 적용)
 */
export function rollDice(
  dice: DiceType,
  count: number = 1,
  modifier: number = 0,
  advantageType: AdvantageType = 'none',
): DiceRoll {
  const sides = getDiceSides(dice);
  let results: number[];

  if (advantageType !== 'none' && dice === 'd20' && count === 1) {
    // 이점/불리: 2번 굴려서 높은/낮은 값 선택
    const roll1 = rollSingle(sides);
    const roll2 = rollSingle(sides);
    const chosen =
      advantageType === 'advantage' ? Math.max(roll1, roll2) : Math.min(roll1, roll2);
    results = [chosen];
  } else {
    results = Array.from({ length: count }, () => rollSingle(sides));
  }

  const sum = results.reduce((a, b) => a + b, 0);

  return {
    dice,
    count,
    modifier,
    advantageType,
    results,
    total: sum + modifier,
  };
}
