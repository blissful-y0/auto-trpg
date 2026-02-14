import { describe, it, expect, beforeEach } from 'vitest';
import { GameEngine } from '../GameEngine';
import { DiceEngine } from '../DiceEngine';
import { ContextManager } from '../../context/ContextManager';

describe('GameEngine', () => {
  let engine: GameEngine;
  let contextManager: ContextManager;
  let diceEngine: DiceEngine;

  beforeEach(() => {
    contextManager = new ContextManager();
    diceEngine = new DiceEngine();
    engine = new GameEngine(contextManager, null, diceEngine);
  });

  describe('classifyAction', () => {
    it('전투 관련 메시지 → combat', () => {
      expect(engine.classifyAction('고블린을 공격한다')).toBe('combat');
      expect(engine.classifyAction('활로 쏜다')).toBe('combat');
      expect(engine.classifyAction('I attack the goblin')).toBe('combat');
      expect(engine.classifyAction('파이어볼 주문을 시전한다')).toBe('combat');
    });

    it('탐색 관련 메시지 → exploration', () => {
      expect(engine.classifyAction('방을 살펴본다')).toBe('exploration');
      expect(engine.classifyAction('문을 열어본다')).toBe('exploration');
      expect(engine.classifyAction('I search the room')).toBe('exploration');
      expect(engine.classifyAction('주변을 조사한다')).toBe('exploration');
    });

    it('롤플레이 관련 메시지 → roleplay', () => {
      expect(engine.classifyAction('상인에게 말한다')).toBe('roleplay');
      expect(engine.classifyAction('경비병을 설득한다')).toBe('roleplay');
      expect(engine.classifyAction('I try to persuade the guard')).toBe('roleplay');
    });

    it('스킬 체크 관련 메시지 → skill_check', () => {
      expect(engine.classifyAction('은신 체크를 시도한다')).toBe('skill_check');
      expect(engine.classifyAction('지각 판정')).toBe('skill_check');
    });

    it('주사위 굴림 메시지 → dice_roll', () => {
      expect(engine.classifyAction('주사위를 굴린다')).toBe('dice_roll');
      expect(engine.classifyAction('roll d20')).toBe('dice_roll');
    });

    it('분류 불가 메시지 → other', () => {
      expect(engine.classifyAction('안녕하세요')).toBe('other');
      expect(engine.classifyAction('...')).toBe('other');
    });
  });

  describe('handleDiceRoll', () => {
    it('주사위 굴림 요청 처리', () => {
      const result = engine.handleDiceRoll({
        notation: '2d6+3',
        purpose: '피해 굴림',
      });

      expect(result.dice).toBe('d6');
      expect(result.count).toBe(2);
      expect(result.modifier).toBe(3);
      expect(result.rolls).toHaveLength(2);
    });

    it('DC 포함 주사위 요청', () => {
      const result = engine.handleDiceRoll({
        notation: '1d20+5',
        purpose: '공격 판정',
        dc: 15,
      });

      expect(result.dice).toBe('d20');
      expect(result.count).toBe(1);
      expect(result.modifier).toBe(5);
    });
  });

  describe('processAction (LLM 미연동)', () => {
    const session = {
      sessionId: 'test-session-1',
      campaignName: '테스트 캠페인',
      rulebookIds: ['dnd5e-basic'],
      setting: '판타지',
      tone: '모험적',
    };

    const characters = [
      {
        characterId: 'char-1',
        name: '아라곤',
        race: '인간',
        class: '전사',
        level: 5,
        hp: { current: 45, max: 50 },
        abilities: { STR: 16, DEX: 14, CON: 14, INT: 10, WIS: 12, CHA: 10 },
        skills: ['운동', '생존'],
        inventory: ['장검', '사슬 갑옷', '방패'],
        conditions: [],
      },
    ];

    it('LLM 미연동 시 기본 응답 반환', async () => {
      const action = {
        sessionId: 'test-session-1',
        characterId: 'char-1',
        userId: 'user-1',
        message: '고블린을 공격한다',
        isOOC: false,
      };

      const result = await engine.processAction(session, characters, action);
      expect(result.narrative).toContain('LLM 미연동');
      expect(result.narrative).toContain('고블린을 공격한다');
      expect(result.narrative).toContain('combat');
    });

    it('직접 주사위 굴림 메시지 처리', async () => {
      const action = {
        sessionId: 'test-session-1',
        characterId: 'char-1',
        userId: 'user-1',
        message: '2d6+3',
        isOOC: false,
      };

      const result = await engine.processAction(session, characters, action);
      expect(result.narrative).toContain('2d6+3');
      expect(result.narrative).toContain('굴림 결과');
    });

    it('상태 변경 적용 검증', async () => {
      const changes = [
        {
          type: 'hp_change' as const,
          targetCharacterId: 'char-1',
          value: -10,
          description: '고블린의 공격으로 10 피해',
        },
        {
          type: 'item_add' as const,
          targetCharacterId: 'char-1',
          value: '치유 포션',
          description: '치유 포션 획득',
        },
      ];

      // applyStateChanges는 에러 없이 실행되어야 함
      await expect(engine.applyStateChanges('test-session-1', changes)).resolves.not.toThrow();
    });
  });

  describe('validateStateChanges', () => {
    const characters = [
      {
        characterId: 'char-1',
        name: '아라곤',
        race: '인간',
        class: '전사',
        level: 5,
        hp: { current: 45, max: 50 },
        abilities: { STR: 16, DEX: 14, CON: 14, INT: 10, WIS: 12, CHA: 10 },
        skills: ['운동', '생존'],
        inventory: ['장검', '사슬 갑옷', '방패'],
        conditions: [],
      },
      {
        characterId: 'char-2',
        name: '레골라스',
        race: '엘프',
        class: '레인저',
        level: 5,
        hp: { current: 10, max: 38 },
        abilities: { STR: 12, DEX: 18, CON: 12, INT: 14, WIS: 14, CHA: 12 },
        skills: ['은신', '생존'],
        inventory: ['장궁', '가죽 갑옷'],
        conditions: [],
      },
    ];

    it('유효한 상태 변경은 통과시킨다', () => {
      const changes = [
        { type: 'hp_change' as const, targetCharacterId: 'char-1', value: -10 },
        { type: 'item_add' as const, targetCharacterId: 'char-1', value: '치유 포션' },
        { type: 'xp_gain' as const, targetCharacterId: 'char-2', value: 100 },
      ];

      const result = engine.validateStateChanges(changes, characters);
      expect(result).toHaveLength(3);
    });

    it('존재하지 않는 캐릭터 ID → 필터링', () => {
      const changes = [
        { type: 'hp_change' as const, targetCharacterId: 'nonexistent-char', value: -10 },
        { type: 'hp_change' as const, targetCharacterId: 'char-1', value: -5 },
      ];

      const result = engine.validateStateChanges(changes, characters);
      expect(result).toHaveLength(1);
      expect(result[0].targetCharacterId).toBe('char-1');
    });

    it('유효하지 않은 변경 유형 → 필터링', () => {
      const changes = [
        { type: 'teleport' as any, targetCharacterId: 'char-1', value: '다른 차원' },
        { type: 'hp_change' as const, targetCharacterId: 'char-1', value: -5 },
      ];

      const result = engine.validateStateChanges(changes, characters);
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('hp_change');
    });

    it('HP가 0 미만으로 내려가면 0으로 클램핑', () => {
      const changes = [
        { type: 'hp_change' as const, targetCharacterId: 'char-2', value: -9999 },
      ];

      const result = engine.validateStateChanges(changes, characters);
      expect(result).toHaveLength(1);
      // char-2의 현재 HP는 10이므로 최대 -10까지만 허용 (HP가 0이 되도록)
      expect(result[0].value).toBe(-10);
    });

    it('HP가 maxHp를 초과하면 maxHp로 클램핑', () => {
      const changes = [
        { type: 'hp_change' as const, targetCharacterId: 'char-1', value: 9999 },
      ];

      const result = engine.validateStateChanges(changes, characters);
      expect(result).toHaveLength(1);
      // char-1의 현재 HP 45, max 50이므로 최대 +5까지만 허용
      expect(result[0].value).toBe(5);
    });

    it('HP 변경 값이 숫자가 아니면 → 필터링', () => {
      const changes = [
        { type: 'hp_change' as const, targetCharacterId: 'char-1', value: 'full heal' as any },
      ];

      const result = engine.validateStateChanges(changes, characters);
      expect(result).toHaveLength(0);
    });

    it('XP/Gold가 ±10000 초과 시 클램핑', () => {
      const changes = [
        { type: 'xp_gain' as const, targetCharacterId: 'char-1', value: 99999 },
        { type: 'gold_change' as const, targetCharacterId: 'char-1', value: -50000 },
      ];

      const result = engine.validateStateChanges(changes, characters);
      expect(result).toHaveLength(2);
      expect(result[0].value).toBe(10000);
      expect(result[1].value).toBe(-10000);
    });

    it('XP/Gold 값이 숫자가 아니면 → 필터링', () => {
      const changes = [
        { type: 'xp_gain' as const, targetCharacterId: 'char-1', value: 'lots' as any },
      ];

      const result = engine.validateStateChanges(changes, characters);
      expect(result).toHaveLength(0);
    });

    it('문자열 타입에 빈 문자열 → 필터링', () => {
      const changes = [
        { type: 'item_add' as const, targetCharacterId: 'char-1', value: '' },
        { type: 'item_add' as const, targetCharacterId: 'char-1', value: '   ' },
        { type: 'condition_add' as const, targetCharacterId: 'char-1', value: 123 as any },
      ];

      const result = engine.validateStateChanges(changes, characters);
      expect(result).toHaveLength(0);
    });

    it('문자열 타입에 유효한 값 → 통과', () => {
      const changes = [
        { type: 'item_add' as const, targetCharacterId: 'char-1', value: '마법 검' },
        { type: 'item_remove' as const, targetCharacterId: 'char-1', value: '장검' },
        { type: 'condition_add' as const, targetCharacterId: 'char-1', value: '독' },
        { type: 'condition_remove' as const, targetCharacterId: 'char-1', value: '독' },
        { type: 'location_change' as const, targetCharacterId: 'char-1', value: '던전 2층' },
      ];

      const result = engine.validateStateChanges(changes, characters);
      expect(result).toHaveLength(5);
    });

    it('빈 changes 배열 → 빈 배열 반환', () => {
      const result = engine.validateStateChanges([], characters);
      expect(result).toHaveLength(0);
    });
  });
});
