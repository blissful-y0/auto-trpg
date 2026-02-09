import { describe, it, expect } from 'vitest';
import { DiceEngine, DiceType } from '../DiceEngine';

describe('DiceEngine', () => {
  const engine = new DiceEngine();

  describe('roll', () => {
    it('d20 결과가 1~20 범위 내', () => {
      for (let i = 0; i < 100; i++) {
        const result = engine.roll('d20');
        expect(result.total).toBeGreaterThanOrEqual(1);
        expect(result.total).toBeLessThanOrEqual(20);
        expect(result.rolls).toHaveLength(1);
        expect(result.dice).toBe('d20');
        expect(result.count).toBe(1);
        expect(result.modifier).toBe(0);
      }
    });

    it('d6 결과가 1~6 범위 내', () => {
      for (let i = 0; i < 100; i++) {
        const result = engine.roll('d6');
        expect(result.total).toBeGreaterThanOrEqual(1);
        expect(result.total).toBeLessThanOrEqual(6);
      }
    });

    it('여러 개 주사위 굴림 (2d6)', () => {
      for (let i = 0; i < 50; i++) {
        const result = engine.roll('d6', 2);
        expect(result.rolls).toHaveLength(2);
        expect(result.total).toBeGreaterThanOrEqual(2);
        expect(result.total).toBeLessThanOrEqual(12);
        expect(result.total).toBe(result.rolls[0] + result.rolls[1]);
      }
    });

    it('수정치 적용 검증', () => {
      for (let i = 0; i < 50; i++) {
        const result = engine.roll('d20', 1, 5);
        expect(result.modifier).toBe(5);
        expect(result.total).toBe(result.rolls[0] + 5);
        expect(result.total).toBeGreaterThanOrEqual(6);
        expect(result.total).toBeLessThanOrEqual(25);
      }
    });

    it('음수 수정치 적용', () => {
      for (let i = 0; i < 50; i++) {
        const result = engine.roll('d20', 1, -2);
        expect(result.modifier).toBe(-2);
        expect(result.total).toBe(result.rolls[0] - 2);
      }
    });

    it('모든 주사위 타입 범위 확인', () => {
      const diceTypes: DiceType[] = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'];
      const maxValues = [4, 6, 8, 10, 12, 20, 100];

      diceTypes.forEach((dice, idx) => {
        for (let i = 0; i < 50; i++) {
          const result = engine.roll(dice);
          expect(result.total).toBeGreaterThanOrEqual(1);
          expect(result.total).toBeLessThanOrEqual(maxValues[idx]);
        }
      });
    });

    it('d20 크리티컬 감지 (nat 20)', () => {
      // 100번 굴려서 크리티컬이 나오면 확인
      let foundCritical = false;
      for (let i = 0; i < 1000; i++) {
        const result = engine.roll('d20');
        if (result.rolls[0] === 20) {
          expect(result.isCritical).toBe(true);
          expect(result.isFumble).toBeUndefined();
          foundCritical = true;
          break;
        }
      }
      // 통계적으로 1000번 중 nat20이 안 나올 확률은 매우 낮음
      expect(foundCritical).toBe(true);
    });

    it('d20 펌블 감지 (nat 1)', () => {
      let foundFumble = false;
      for (let i = 0; i < 1000; i++) {
        const result = engine.roll('d20');
        if (result.rolls[0] === 1) {
          expect(result.isFumble).toBe(true);
          expect(result.isCritical).toBeUndefined();
          foundFumble = true;
          break;
        }
      }
      expect(foundFumble).toBe(true);
    });

    it('d6 여러 개에서는 크리티컬/펌블 없음', () => {
      for (let i = 0; i < 50; i++) {
        const result = engine.roll('d6', 2);
        expect(result.isCritical).toBeUndefined();
        expect(result.isFumble).toBeUndefined();
      }
    });
  });

  describe('rollWithAdvantage', () => {
    it('이점: 2번 굴려서 높은 값 선택', () => {
      for (let i = 0; i < 100; i++) {
        const result = engine.rollWithAdvantage('d20', true);
        expect(result.rolls).toHaveLength(2);
        expect(result.total).toBe(Math.max(result.rolls[0], result.rolls[1]));
      }
    });

    it('불리: 2번 굴려서 낮은 값 선택', () => {
      for (let i = 0; i < 100; i++) {
        const result = engine.rollWithAdvantage('d20', false);
        expect(result.rolls).toHaveLength(2);
        expect(result.total).toBe(Math.min(result.rolls[0], result.rolls[1]));
      }
    });

    it('이점 결과 범위가 1~20', () => {
      for (let i = 0; i < 100; i++) {
        const result = engine.rollWithAdvantage('d20', true);
        expect(result.total).toBeGreaterThanOrEqual(1);
        expect(result.total).toBeLessThanOrEqual(20);
      }
    });
  });

  describe('rollNotation', () => {
    it('"2d6+3" 파싱 및 굴림', () => {
      for (let i = 0; i < 50; i++) {
        const result = engine.rollNotation('2d6+3');
        expect(result.dice).toBe('d6');
        expect(result.count).toBe(2);
        expect(result.modifier).toBe(3);
        expect(result.rolls).toHaveLength(2);
        expect(result.total).toBe(result.rolls[0] + result.rolls[1] + 3);
      }
    });

    it('"1d20-1" 파싱 및 굴림', () => {
      for (let i = 0; i < 50; i++) {
        const result = engine.rollNotation('1d20-1');
        expect(result.dice).toBe('d20');
        expect(result.count).toBe(1);
        expect(result.modifier).toBe(-1);
        expect(result.total).toBe(result.rolls[0] - 1);
      }
    });

    it('"4d6" 파싱 (수정치 없음)', () => {
      const result = engine.rollNotation('4d6');
      expect(result.dice).toBe('d6');
      expect(result.count).toBe(4);
      expect(result.modifier).toBe(0);
      expect(result.rolls).toHaveLength(4);
    });

    it('"d20" (횟수 생략 → 1개)', () => {
      const result = engine.rollNotation('d20');
      expect(result.count).toBe(1);
      expect(result.rolls).toHaveLength(1);
    });

    it('잘못된 표기법은 에러 발생', () => {
      expect(() => engine.rollNotation('abc')).toThrow('잘못된 주사위 표기법');
      expect(() => engine.rollNotation('')).toThrow('잘못된 주사위 표기법');
    });

    it('지원하지 않는 주사위 타입은 에러', () => {
      expect(() => engine.rollNotation('1d7')).toThrow('지원하지 않는 주사위');
      expect(() => engine.rollNotation('2d3')).toThrow('지원하지 않는 주사위');
    });
  });

  describe('getModifier', () => {
    it('능력치 10 → 수정치 0', () => {
      expect(engine.getModifier(10)).toBe(0);
    });

    it('능력치 11 → 수정치 0', () => {
      expect(engine.getModifier(11)).toBe(0);
    });

    it('능력치 14 → 수정치 +2', () => {
      expect(engine.getModifier(14)).toBe(2);
    });

    it('능력치 8 → 수정치 -1', () => {
      expect(engine.getModifier(8)).toBe(-1);
    });

    it('능력치 20 → 수정치 +5', () => {
      expect(engine.getModifier(20)).toBe(5);
    });

    it('능력치 1 → 수정치 -5', () => {
      expect(engine.getModifier(1)).toBe(-5);
    });

    it('능력치 15 → 수정치 +2 (내림)', () => {
      expect(engine.getModifier(15)).toBe(2);
    });

    it('능력치 7 → 수정치 -2 (내림)', () => {
      expect(engine.getModifier(7)).toBe(-2);
    });
  });

  describe('skillCheck', () => {
    it('기본 스킬 체크 (수정치만)', () => {
      for (let i = 0; i < 50; i++) {
        const result = engine.skillCheck(14); // 수정치 +2
        expect(result.dice).toBe('d20');
        expect(result.modifier).toBe(2);
        expect(result.total).toBe(result.rolls[0] + 2);
      }
    });

    it('숙련 보너스 포함 스킬 체크', () => {
      for (let i = 0; i < 50; i++) {
        const result = engine.skillCheck(14, 3); // 수정치 +2, 숙련 +3 = +5
        expect(result.modifier).toBe(5);
        expect(result.total).toBe(result.rolls[0] + 5);
      }
    });

    it('이점 포함 스킬 체크', () => {
      for (let i = 0; i < 50; i++) {
        const result = engine.skillCheck(14, 0, true);
        expect(result.rolls).toHaveLength(2);
        const chosen = Math.max(result.rolls[0], result.rolls[1]);
        expect(result.total).toBe(chosen + 2);
      }
    });

    it('불리 포함 스킬 체크', () => {
      for (let i = 0; i < 50; i++) {
        const result = engine.skillCheck(14, 0, false);
        expect(result.rolls).toHaveLength(2);
        const chosen = Math.min(result.rolls[0], result.rolls[1]);
        expect(result.total).toBe(chosen + 2);
      }
    });
  });
});
