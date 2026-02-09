// 강화된 전투 관리자 — 기존 CombatManager 확장 (상태이상, 피해 계산, 턴 타이머)

import { CombatManager, type CombatParticipant } from '../CombatManager';
import { DiceEngine } from '../DiceEngine';
import { DamageCalculator } from './DamageCalculator';
import { ConditionTracker } from './ConditionTracker';
import type {
  EnhancedCombatState,
  EnhancedCombatant,
  AttackResult,
  DamageInput,
  Condition,
  AbilityType,
  CombatLogEntry,
} from './types';

// 기본 턴 타이머 (초)
const DEFAULT_TURN_TIMER = 180; // 3분
// 최대 전투 로그 수
const MAX_LOG_ENTRIES = 50;

// 확장 참가자 정보 (전투 시작용)
export interface EnhancedParticipant extends CombatParticipant {
  hpCurrent: number;
  hpMax: number;
  armorClass: number;
  abilities: Record<AbilityType, number>;
  proficiencyBonus: number;
}

export class EnhancedCombatManager {
  private baseCombatManager: CombatManager;
  private damageCalc: DamageCalculator;
  private conditionTracker: ConditionTracker;

  constructor(diceEngine: DiceEngine) {
    this.baseCombatManager = new CombatManager(diceEngine);
    this.damageCalc = new DamageCalculator(diceEngine);
    this.conditionTracker = new ConditionTracker(diceEngine);
  }

  // ─── 전투 시작 ────────────────────────────────────

  startCombat(sessionId: string, participants: EnhancedParticipant[]): EnhancedCombatState {
    // 기존 CombatManager로 이니셔티브 처리
    const baseState = this.baseCombatManager.startCombat(sessionId, participants);

    // 확장 참가자 정보 매핑
    const combatants: EnhancedCombatant[] = baseState.combatants.map((base) => {
      const participant = participants.find((p) => p.characterId === base.characterId)!;
      return {
        characterId: base.characterId,
        name: base.name,
        initiative: base.initiative,
        isPlayer: base.isPlayer,
        hpCurrent: participant.hpCurrent,
        hpMax: participant.hpMax,
        armorClass: participant.armorClass,
        conditions: [],
        abilities: participant.abilities,
        proficiencyBonus: participant.proficiencyBonus,
      };
    });

    return {
      sessionId,
      isActive: true,
      round: 1,
      currentTurnIndex: 0,
      combatants,
      turnTimerSeconds: DEFAULT_TURN_TIMER,
      turnStartedAt: new Date().toISOString(),
      log: [{
        round: 1,
        turn: 0,
        actorId: 'system',
        actorName: '시스템',
        action: '전투 시작',
        result: `${combatants.length}명의 참가자로 전투가 시작됩니다.`,
        timestamp: new Date().toISOString(),
      }],
    };
  }

  // ─── 다음 턴 ──────────────────────────────────────

  nextTurn(state: EnhancedCombatState): EnhancedCombatState {
    const currentCombatant = state.combatants[state.currentTurnIndex];

    // 현재 턴 종료 시 상태이상 세이빙 스로우 처리
    let updatedCombatants = [...state.combatants];
    if (currentCombatant) {
      const endOfTurn = this.conditionTracker.processEndOfTurn(
        currentCombatant.conditions,
        currentCombatant.abilities,
        currentCombatant.proficiencyBonus,
      );

      updatedCombatants[state.currentTurnIndex] = {
        ...currentCombatant,
        conditions: endOfTurn.conditions,
      };
    }

    // 다음 인덱스 계산
    let nextIndex = state.currentTurnIndex + 1;
    let nextRound = state.round;

    if (nextIndex >= state.combatants.length) {
      nextIndex = 0;
      nextRound = state.round + 1;
    }

    // 다음 턴 시작 시 상태이상 duration 감소
    const nextCombatant = updatedCombatants[nextIndex];
    if (nextCombatant) {
      const startOfTurn = this.conditionTracker.processStartOfTurn(
        nextCombatant.conditions,
      );

      updatedCombatants[nextIndex] = {
        ...nextCombatant,
        conditions: startOfTurn.conditions,
      };
    }

    // 행동 불가 상태이면 자동으로 다음 턴으로 건너뛰기
    // (재귀 호출 시 무한 루프 방지: 전원 행동 불가면 멈춤)
    const skippable = nextCombatant &&
      this.conditionTracker.isIncapacitated(updatedCombatants[nextIndex].conditions);

    const newState: EnhancedCombatState = {
      ...state,
      round: nextRound,
      currentTurnIndex: nextIndex,
      combatants: updatedCombatants,
      turnStartedAt: new Date().toISOString(),
    };

    if (skippable) {
      // 한 바퀴 돌았는데 모두 행동 불가면 멈춤
      const allIncapacitated = updatedCombatants.every((c) =>
        this.conditionTracker.isIncapacitated(c.conditions) || c.hpCurrent <= 0,
      );
      if (!allIncapacitated) {
        return this.nextTurn(newState);
      }
    }

    return newState;
  }

  // ─── 전투 종료 ────────────────────────────────────

  endCombat(state: EnhancedCombatState): EnhancedCombatState {
    return {
      ...state,
      isActive: false,
      log: this.addLog(state.log, {
        round: state.round,
        turn: state.currentTurnIndex,
        actorId: 'system',
        actorName: '시스템',
        action: '전투 종료',
        result: `라운드 ${state.round}에서 전투가 종료됩니다.`,
        timestamp: new Date().toISOString(),
      }),
    };
  }

  // ─── 공격 처리 ────────────────────────────────────

  resolveAttack(
    state: EnhancedCombatState,
    attackerId: string,
    targetId: string,
    damageInput: DamageInput,
    attackModifier: number,
  ): { state: EnhancedCombatState; result: AttackResult } {
    const attackerIdx = state.combatants.findIndex((c) => c.characterId === attackerId);
    const targetIdx = state.combatants.findIndex((c) => c.characterId === targetId);

    if (attackerIdx === -1 || targetIdx === -1) {
      throw new Error('공격자 또는 대상을 찾을 수 없습니다.');
    }

    const attacker = state.combatants[attackerIdx];
    const target = state.combatants[targetIdx];

    // 이점/불리 계산 (상태이상 기반)
    const advantage = this.conditionTracker.getAttackAdvantage(
      attacker.conditions,
      target.conditions,
    );

    // 공격 판정 + 피해 계산
    const result = this.damageCalc.resolveAttack(
      attackModifier,
      target.armorClass,
      damageInput,
      advantage,
    );

    // 피해 적용
    const updatedCombatants = [...state.combatants];
    if (result.hit && result.damage) {
      const newHp = Math.max(0, target.hpCurrent - result.damage);
      let newConditions = target.conditions;

      // HP 0 이하 시 unconscious 상태 추가
      if (newHp === 0 && target.hpCurrent > 0) {
        newConditions = this.conditionTracker.addCondition(
          newConditions, 'unconscious', 'system', -1,
        );
      }

      updatedCombatants[targetIdx] = {
        ...target,
        hpCurrent: newHp,
        conditions: newConditions,
      };
    }

    // 전투 로그
    const logEntry: CombatLogEntry = {
      round: state.round,
      turn: state.currentTurnIndex,
      actorId: attackerId,
      actorName: attacker.name,
      action: `${target.name}에게 공격`,
      result: result.hit
        ? `명중! ${result.damage ?? 0} ${damageInput.damageType} 피해${result.critical ? ' (크리티컬!)' : ''}`
        : result.fumble
          ? '펌블! 자동 실패'
          : `빗나감 (${result.total} vs AC ${target.armorClass})`,
      timestamp: new Date().toISOString(),
    };

    return {
      state: {
        ...state,
        combatants: updatedCombatants,
        log: this.addLog(state.log, logEntry),
      },
      result,
    };
  }

  // ─── 상태이상 적용 ────────────────────────────────

  applyCondition(
    state: EnhancedCombatState,
    targetId: string,
    condition: Condition,
    sourceId: string,
    duration: number = -1,
    saveDC?: number,
    saveAbility?: AbilityType,
  ): EnhancedCombatState {
    const targetIdx = state.combatants.findIndex((c) => c.characterId === targetId);
    if (targetIdx === -1) throw new Error('대상을 찾을 수 없습니다.');

    const target = state.combatants[targetIdx];
    const updatedConditions = this.conditionTracker.addCondition(
      target.conditions, condition, sourceId, duration, saveDC, saveAbility,
    );

    const updatedCombatants = [...state.combatants];
    updatedCombatants[targetIdx] = { ...target, conditions: updatedConditions };

    return { ...state, combatants: updatedCombatants };
  }

  // ─── 피해 적용 (직접) ─────────────────────────────

  applyDamage(
    state: EnhancedCombatState,
    targetId: string,
    damage: number,
  ): EnhancedCombatState {
    const targetIdx = state.combatants.findIndex((c) => c.characterId === targetId);
    if (targetIdx === -1) throw new Error('대상을 찾을 수 없습니다.');

    const target = state.combatants[targetIdx];
    const newHp = Math.max(0, target.hpCurrent - damage);

    const updatedCombatants = [...state.combatants];
    let newConditions = target.conditions;

    if (newHp === 0 && target.hpCurrent > 0) {
      newConditions = this.conditionTracker.addCondition(
        newConditions, 'unconscious', 'system', -1,
      );
    }

    updatedCombatants[targetIdx] = {
      ...target,
      hpCurrent: newHp,
      conditions: newConditions,
    };

    return { ...state, combatants: updatedCombatants };
  }

  // ─── 치유 적용 ────────────────────────────────────

  applyHealing(
    state: EnhancedCombatState,
    targetId: string,
    healing: number,
  ): EnhancedCombatState {
    const targetIdx = state.combatants.findIndex((c) => c.characterId === targetId);
    if (targetIdx === -1) throw new Error('대상을 찾을 수 없습니다.');

    const target = state.combatants[targetIdx];
    const newHp = Math.min(target.hpMax, target.hpCurrent + healing);

    const updatedCombatants = [...state.combatants];
    let newConditions = target.conditions;

    // 0에서 회복 시 unconscious 해제
    if (target.hpCurrent === 0 && newHp > 0) {
      newConditions = this.conditionTracker.removeCondition(
        newConditions, 'unconscious',
      );
    }

    updatedCombatants[targetIdx] = {
      ...target,
      hpCurrent: newHp,
      conditions: newConditions,
    };

    return { ...state, combatants: updatedCombatants };
  }

  // ─── 현재 턴 캐릭터 ──────────────────────────────

  getCurrentTurnCombatant(state: EnhancedCombatState): EnhancedCombatant {
    return state.combatants[state.currentTurnIndex];
  }

  // ─── 전투 종료 조건 확인 ──────────────────────────

  shouldEndCombat(state: EnhancedCombatState): boolean {
    const alivePlayers = state.combatants.filter((c) => c.isPlayer && c.hpCurrent > 0);
    const aliveEnemies = state.combatants.filter((c) => !c.isPlayer && c.hpCurrent > 0);

    return alivePlayers.length === 0 || aliveEnemies.length === 0;
  }

  // ─── 내부 헬퍼 ────────────────────────────────────

  private addLog(log: CombatLogEntry[], entry: CombatLogEntry): CombatLogEntry[] {
    const newLog = [...log, entry];
    if (newLog.length > MAX_LOG_ENTRIES) {
      return newLog.slice(-MAX_LOG_ENTRIES);
    }
    return newLog;
  }
}
