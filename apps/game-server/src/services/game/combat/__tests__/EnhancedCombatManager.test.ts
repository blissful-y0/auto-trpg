import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DiceEngine } from '../../DiceEngine';
import { EnhancedCombatManager, type EnhancedParticipant } from '../EnhancedCombatManager';
import type { EnhancedCombatState, AbilityType } from '../types';

// 기본 능력치 헬퍼
const defaultAbilities: Record<AbilityType, number> = {
  strength: 14,
  dexterity: 12,
  constitution: 16,
  intelligence: 10,
  wisdom: 13,
  charisma: 8,
};

// 테스트용 참가자 생성
function makeParticipant(overrides: Partial<EnhancedParticipant> = {}): EnhancedParticipant {
  return {
    characterId: 'char-1',
    name: '전사',
    dexterityScore: 14,
    isPlayer: true,
    hpCurrent: 30,
    hpMax: 30,
    armorClass: 16,
    abilities: defaultAbilities,
    proficiencyBonus: 3,
    ...overrides,
  };
}

describe('EnhancedCombatManager', () => {
  let diceEngine: DiceEngine;
  let manager: EnhancedCombatManager;

  beforeEach(() => {
    diceEngine = new DiceEngine();
    manager = new EnhancedCombatManager(diceEngine);
  });

  // ─── startCombat ────────────────────────────────────

  describe('startCombat', () => {
    it('전투 시작 — 참가자 초기화', () => {
      // 이니셔티브 굴림 모킹
      vi.spyOn(diceEngine, 'getModifier').mockReturnValue(2);
      vi.spyOn(diceEngine, 'roll')
        .mockReturnValueOnce({ dice: 'd20', count: 1, modifier: 2, rolls: [15], total: 17 })
        .mockReturnValueOnce({ dice: 'd20', count: 1, modifier: 2, rolls: [10], total: 12 });

      const participants = [
        makeParticipant({ characterId: 'p1', name: '전사', isPlayer: true }),
        makeParticipant({ characterId: 'e1', name: '고블린', isPlayer: false, hpCurrent: 10, hpMax: 10, armorClass: 12 }),
      ];

      const state = manager.startCombat('session-1', participants);

      expect(state.isActive).toBe(true);
      expect(state.round).toBe(1);
      expect(state.currentTurnIndex).toBe(0);
      expect(state.combatants).toHaveLength(2);
      expect(state.sessionId).toBe('session-1');
      expect(state.turnTimerSeconds).toBe(180);
      expect(state.log).toHaveLength(1);
      expect(state.log[0].action).toBe('전투 시작');

      // 모든 참가자에 conditions 빈 배열
      state.combatants.forEach((c) => {
        expect(c.conditions).toEqual([]);
      });
    });
  });

  // ─── endCombat ──────────────────────────────────────

  describe('endCombat', () => {
    it('전투 종료', () => {
      vi.spyOn(diceEngine, 'getModifier').mockReturnValue(0);
      vi.spyOn(diceEngine, 'roll').mockReturnValue({
        dice: 'd20', count: 1, modifier: 0, rolls: [10], total: 10,
      });

      const participants = [
        makeParticipant({ characterId: 'p1' }),
      ];
      const state = manager.startCombat('session-1', participants);
      const ended = manager.endCombat(state);

      expect(ended.isActive).toBe(false);
      expect(ended.log.length).toBeGreaterThan(state.log.length);
      expect(ended.log[ended.log.length - 1].action).toBe('전투 종료');
    });
  });

  // ─── nextTurn ───────────────────────────────────────

  describe('nextTurn', () => {
    function createTwoPlayerState(): EnhancedCombatState {
      return {
        sessionId: 'session-1',
        isActive: true,
        round: 1,
        currentTurnIndex: 0,
        combatants: [
          {
            characterId: 'p1', name: '전사', initiative: 18, isPlayer: true,
            hpCurrent: 30, hpMax: 30, armorClass: 16, conditions: [],
            abilities: defaultAbilities, proficiencyBonus: 3,
          },
          {
            characterId: 'e1', name: '고블린', initiative: 12, isPlayer: false,
            hpCurrent: 10, hpMax: 10, armorClass: 12, conditions: [],
            abilities: defaultAbilities, proficiencyBonus: 2,
          },
        ],
        turnTimerSeconds: 180,
        log: [],
      };
    }

    it('다음 턴으로 진행', () => {
      const state = createTwoPlayerState();
      const next = manager.nextTurn(state);
      expect(next.currentTurnIndex).toBe(1);
      expect(next.round).toBe(1);
    });

    it('마지막 참가자 턴 후 다음 라운드', () => {
      const state = createTwoPlayerState();
      state.currentTurnIndex = 1;
      const next = manager.nextTurn(state);
      expect(next.currentTurnIndex).toBe(0);
      expect(next.round).toBe(2);
    });

    it('행동 불가(incapacitated) 캐릭터 자동 건너뛰기', () => {
      const state = createTwoPlayerState();
      // 고블린(인덱스 1)에 stunned 부여
      state.combatants[1].conditions = [
        { condition: 'stunned', sourceId: 'spell-1', duration: -1 },
      ];

      // 턴 0 → 턴 1(stunned, 건너뜀) → 턴 0(라운드 2)
      const next = manager.nextTurn(state);
      expect(next.currentTurnIndex).toBe(0);
      expect(next.round).toBe(2);
    });

    it('모두 행동 불가면 무한 루프 없이 멈춤', () => {
      const state = createTwoPlayerState();
      state.combatants[0].conditions = [
        { condition: 'paralyzed', sourceId: 's1', duration: -1 },
      ];
      state.combatants[1].conditions = [
        { condition: 'stunned', sourceId: 's2', duration: -1 },
      ];

      // 무한 루프 없이 반환됨
      const next = manager.nextTurn(state);
      expect(next).toBeDefined();
    });
  });

  // ─── resolveAttack ──────────────────────────────────

  describe('resolveAttack', () => {
    function createCombatState(): EnhancedCombatState {
      return {
        sessionId: 'session-1',
        isActive: true,
        round: 1,
        currentTurnIndex: 0,
        combatants: [
          {
            characterId: 'p1', name: '전사', initiative: 18, isPlayer: true,
            hpCurrent: 30, hpMax: 30, armorClass: 16, conditions: [],
            abilities: defaultAbilities, proficiencyBonus: 3,
          },
          {
            characterId: 'e1', name: '고블린', initiative: 12, isPlayer: false,
            hpCurrent: 10, hpMax: 10, armorClass: 12, conditions: [],
            abilities: defaultAbilities, proficiencyBonus: 2,
          },
        ],
        turnTimerSeconds: 180,
        log: [],
      };
    }

    it('공격 명중 시 피해 적용', () => {
      // 공격 굴림: 15
      vi.spyOn(diceEngine, 'roll').mockReturnValueOnce({
        dice: 'd20', count: 1, modifier: 0, rolls: [15], total: 15,
      });
      // 피해 굴림
      vi.spyOn(diceEngine, 'rollNotation').mockReturnValueOnce({
        dice: 'd8', count: 1, modifier: 0, rolls: [6], total: 6,
      });

      const state = createCombatState();
      const { state: newState, result } = manager.resolveAttack(
        state, 'p1', 'e1',
        { damageDice: '1d8', damageModifier: 3, damageType: 'slashing', isCritical: false },
        5,
      );

      expect(result.hit).toBe(true);
      expect(newState.combatants[1].hpCurrent).toBe(1); // 10 - 9 = 1
      expect(newState.log).toHaveLength(1);
      expect(newState.log[0].actorName).toBe('전사');
    });

    it('공격 빗나감 시 HP 변동 없음', () => {
      vi.spyOn(diceEngine, 'roll').mockReturnValueOnce({
        dice: 'd20', count: 1, modifier: 0, rolls: [2], total: 2,
      });

      const state = createCombatState();
      const { state: newState, result } = manager.resolveAttack(
        state, 'p1', 'e1',
        { damageDice: '1d8', damageModifier: 3, damageType: 'slashing', isCritical: false },
        5,
      );

      expect(result.hit).toBe(false);
      expect(newState.combatants[1].hpCurrent).toBe(10);
    });

    it('HP 0 시 unconscious 자동 부여', () => {
      // 큰 피해로 고블린 HP 0 만들기
      vi.spyOn(diceEngine, 'roll').mockReturnValueOnce({
        dice: 'd20', count: 1, modifier: 0, rolls: [15], total: 15,
      });
      vi.spyOn(diceEngine, 'rollNotation').mockReturnValueOnce({
        dice: 'd8', count: 1, modifier: 0, rolls: [8], total: 8,
      });

      const state = createCombatState();
      const { state: newState } = manager.resolveAttack(
        state, 'p1', 'e1',
        { damageDice: '1d8', damageModifier: 5, damageType: 'slashing', isCritical: false },
        5,
      );

      expect(newState.combatants[1].hpCurrent).toBe(0);
      expect(newState.combatants[1].conditions).toContainEqual(
        expect.objectContaining({ condition: 'unconscious' }),
      );
    });

    it('존재하지 않는 캐릭터 공격 시 에러', () => {
      const state = createCombatState();
      expect(() =>
        manager.resolveAttack(
          state, 'p1', 'invalid',
          { damageDice: '1d8', damageModifier: 3, damageType: 'slashing', isCritical: false },
          5,
        ),
      ).toThrow('공격자 또는 대상을 찾을 수 없습니다.');
    });
  });

  // ─── applyCondition ─────────────────────────────────

  describe('applyCondition', () => {
    it('상태이상 적용', () => {
      const state: EnhancedCombatState = {
        sessionId: 's1', isActive: true, round: 1, currentTurnIndex: 0,
        combatants: [{
          characterId: 'p1', name: '전사', initiative: 18, isPlayer: true,
          hpCurrent: 30, hpMax: 30, armorClass: 16, conditions: [],
          abilities: defaultAbilities, proficiencyBonus: 3,
        }],
        turnTimerSeconds: 180, log: [],
      };

      const newState = manager.applyCondition(state, 'p1', 'poisoned', 'trap-1', 3);
      expect(newState.combatants[0].conditions).toHaveLength(1);
      expect(newState.combatants[0].conditions[0].condition).toBe('poisoned');
    });

    it('존재하지 않는 대상에 적용 시 에러', () => {
      const state: EnhancedCombatState = {
        sessionId: 's1', isActive: true, round: 1, currentTurnIndex: 0,
        combatants: [], turnTimerSeconds: 180, log: [],
      };
      expect(() => manager.applyCondition(state, 'invalid', 'blinded', 's1')).toThrow('대상을 찾을 수 없습니다.');
    });
  });

  // ─── applyDamage / applyHealing ─────────────────────

  describe('applyDamage', () => {
    it('직접 피해 적용', () => {
      const state: EnhancedCombatState = {
        sessionId: 's1', isActive: true, round: 1, currentTurnIndex: 0,
        combatants: [{
          characterId: 'p1', name: '전사', initiative: 18, isPlayer: true,
          hpCurrent: 30, hpMax: 30, armorClass: 16, conditions: [],
          abilities: defaultAbilities, proficiencyBonus: 3,
        }],
        turnTimerSeconds: 180, log: [],
      };

      const newState = manager.applyDamage(state, 'p1', 10);
      expect(newState.combatants[0].hpCurrent).toBe(20);
    });

    it('HP 0 이하 시 unconscious 자동 부여', () => {
      const state: EnhancedCombatState = {
        sessionId: 's1', isActive: true, round: 1, currentTurnIndex: 0,
        combatants: [{
          characterId: 'p1', name: '전사', initiative: 18, isPlayer: true,
          hpCurrent: 5, hpMax: 30, armorClass: 16, conditions: [],
          abilities: defaultAbilities, proficiencyBonus: 3,
        }],
        turnTimerSeconds: 180, log: [],
      };

      const newState = manager.applyDamage(state, 'p1', 20);
      expect(newState.combatants[0].hpCurrent).toBe(0);
      expect(newState.combatants[0].conditions).toContainEqual(
        expect.objectContaining({ condition: 'unconscious' }),
      );
    });

    it('이미 HP 0인 캐릭터에 추가 피해 시 중복 unconscious 없음', () => {
      const state: EnhancedCombatState = {
        sessionId: 's1', isActive: true, round: 1, currentTurnIndex: 0,
        combatants: [{
          characterId: 'p1', name: '전사', initiative: 18, isPlayer: true,
          hpCurrent: 0, hpMax: 30, armorClass: 16,
          conditions: [{ condition: 'unconscious', sourceId: 'system', duration: -1 }],
          abilities: defaultAbilities, proficiencyBonus: 3,
        }],
        turnTimerSeconds: 180, log: [],
      };

      const newState = manager.applyDamage(state, 'p1', 5);
      expect(newState.combatants[0].hpCurrent).toBe(0);
      // unconscious가 중복 추가되지 않아야 함 (hpCurrent가 이미 0)
      const unconsciousCount = newState.combatants[0].conditions.filter(
        (c) => c.condition === 'unconscious',
      ).length;
      expect(unconsciousCount).toBe(1);
    });
  });

  describe('applyHealing', () => {
    it('치유 적용', () => {
      const state: EnhancedCombatState = {
        sessionId: 's1', isActive: true, round: 1, currentTurnIndex: 0,
        combatants: [{
          characterId: 'p1', name: '전사', initiative: 18, isPlayer: true,
          hpCurrent: 10, hpMax: 30, armorClass: 16, conditions: [],
          abilities: defaultAbilities, proficiencyBonus: 3,
        }],
        turnTimerSeconds: 180, log: [],
      };

      const newState = manager.applyHealing(state, 'p1', 15);
      expect(newState.combatants[0].hpCurrent).toBe(25);
    });

    it('최대 HP 초과 불가', () => {
      const state: EnhancedCombatState = {
        sessionId: 's1', isActive: true, round: 1, currentTurnIndex: 0,
        combatants: [{
          characterId: 'p1', name: '전사', initiative: 18, isPlayer: true,
          hpCurrent: 25, hpMax: 30, armorClass: 16, conditions: [],
          abilities: defaultAbilities, proficiencyBonus: 3,
        }],
        turnTimerSeconds: 180, log: [],
      };

      const newState = manager.applyHealing(state, 'p1', 50);
      expect(newState.combatants[0].hpCurrent).toBe(30);
    });

    it('HP 0에서 치유 시 unconscious 자동 해제', () => {
      const state: EnhancedCombatState = {
        sessionId: 's1', isActive: true, round: 1, currentTurnIndex: 0,
        combatants: [{
          characterId: 'p1', name: '전사', initiative: 18, isPlayer: true,
          hpCurrent: 0, hpMax: 30, armorClass: 16,
          conditions: [{ condition: 'unconscious', sourceId: 'system', duration: -1 }],
          abilities: defaultAbilities, proficiencyBonus: 3,
        }],
        turnTimerSeconds: 180, log: [],
      };

      const newState = manager.applyHealing(state, 'p1', 10);
      expect(newState.combatants[0].hpCurrent).toBe(10);
      expect(newState.combatants[0].conditions).not.toContainEqual(
        expect.objectContaining({ condition: 'unconscious' }),
      );
    });
  });

  // ─── shouldEndCombat ────────────────────────────────

  describe('shouldEndCombat', () => {
    it('모든 적 쓰러지면 전투 종료', () => {
      const state: EnhancedCombatState = {
        sessionId: 's1', isActive: true, round: 3, currentTurnIndex: 0,
        combatants: [
          {
            characterId: 'p1', name: '전사', initiative: 18, isPlayer: true,
            hpCurrent: 20, hpMax: 30, armorClass: 16, conditions: [],
            abilities: defaultAbilities, proficiencyBonus: 3,
          },
          {
            characterId: 'e1', name: '고블린', initiative: 12, isPlayer: false,
            hpCurrent: 0, hpMax: 10, armorClass: 12, conditions: [],
            abilities: defaultAbilities, proficiencyBonus: 2,
          },
        ],
        turnTimerSeconds: 180, log: [],
      };
      expect(manager.shouldEndCombat(state)).toBe(true);
    });

    it('모든 아군 쓰러지면 전투 종료', () => {
      const state: EnhancedCombatState = {
        sessionId: 's1', isActive: true, round: 3, currentTurnIndex: 0,
        combatants: [
          {
            characterId: 'p1', name: '전사', initiative: 18, isPlayer: true,
            hpCurrent: 0, hpMax: 30, armorClass: 16, conditions: [],
            abilities: defaultAbilities, proficiencyBonus: 3,
          },
          {
            characterId: 'e1', name: '고블린', initiative: 12, isPlayer: false,
            hpCurrent: 5, hpMax: 10, armorClass: 12, conditions: [],
            abilities: defaultAbilities, proficiencyBonus: 2,
          },
        ],
        turnTimerSeconds: 180, log: [],
      };
      expect(manager.shouldEndCombat(state)).toBe(true);
    });

    it('양쪽 모두 생존 시 전투 계속', () => {
      const state: EnhancedCombatState = {
        sessionId: 's1', isActive: true, round: 2, currentTurnIndex: 0,
        combatants: [
          {
            characterId: 'p1', name: '전사', initiative: 18, isPlayer: true,
            hpCurrent: 20, hpMax: 30, armorClass: 16, conditions: [],
            abilities: defaultAbilities, proficiencyBonus: 3,
          },
          {
            characterId: 'e1', name: '고블린', initiative: 12, isPlayer: false,
            hpCurrent: 5, hpMax: 10, armorClass: 12, conditions: [],
            abilities: defaultAbilities, proficiencyBonus: 2,
          },
        ],
        turnTimerSeconds: 180, log: [],
      };
      expect(manager.shouldEndCombat(state)).toBe(false);
    });
  });

  // ─── getCurrentTurnCombatant ────────────────────────

  describe('getCurrentTurnCombatant', () => {
    it('현재 턴 캐릭터 반환', () => {
      const state: EnhancedCombatState = {
        sessionId: 's1', isActive: true, round: 1, currentTurnIndex: 1,
        combatants: [
          {
            characterId: 'p1', name: '전사', initiative: 18, isPlayer: true,
            hpCurrent: 30, hpMax: 30, armorClass: 16, conditions: [],
            abilities: defaultAbilities, proficiencyBonus: 3,
          },
          {
            characterId: 'e1', name: '고블린', initiative: 12, isPlayer: false,
            hpCurrent: 10, hpMax: 10, armorClass: 12, conditions: [],
            abilities: defaultAbilities, proficiencyBonus: 2,
          },
        ],
        turnTimerSeconds: 180, log: [],
      };

      const current = manager.getCurrentTurnCombatant(state);
      expect(current.characterId).toBe('e1');
      expect(current.name).toBe('고블린');
    });
  });
});
