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
});
