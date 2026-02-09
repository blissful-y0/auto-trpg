// 상태이상 추적기 — D&D 5e 15종 상태이상 관리

import { DiceEngine } from '../DiceEngine';
import type {
  Condition,
  AppliedCondition,
  AbilityType,
} from './types';

export class ConditionTracker {
  constructor(private diceEngine: DiceEngine) {}

  // ─── 상태이상 추가 ────────────────────────────────

  addCondition(
    currentConditions: AppliedCondition[],
    condition: Condition,
    sourceId: string,
    duration: number = -1,  // -1 = 영구 (세이빙 스로우로 해제)
    saveDC?: number,
    saveAbility?: AbilityType,
  ): AppliedCondition[] {
    // 같은 소스의 같은 상태이상은 중복 불가 (갱신)
    const filtered = currentConditions.filter(
      (c) => !(c.condition === condition && c.sourceId === sourceId),
    );

    const newCondition: AppliedCondition = {
      condition,
      sourceId,
      duration,
      saveDC,
      saveAbility,
    };

    return [...filtered, newCondition];
  }

  // ─── 상태이상 제거 ────────────────────────────────

  removeCondition(
    currentConditions: AppliedCondition[],
    condition: Condition,
    sourceId?: string,
  ): AppliedCondition[] {
    if (sourceId) {
      // 특정 소스의 상태이상만 제거
      return currentConditions.filter(
        (c) => !(c.condition === condition && c.sourceId === sourceId),
      );
    }
    // 해당 상태이상 모두 제거
    return currentConditions.filter((c) => c.condition !== condition);
  }

  // ─── 턴 시작 시 처리 ──────────────────────────────

  // 턴 시작 시 duration 감소 및 만료 처리
  processStartOfTurn(
    currentConditions: AppliedCondition[],
  ): { conditions: AppliedCondition[]; expired: Condition[] } {
    const expired: Condition[] = [];
    const remaining: AppliedCondition[] = [];

    for (const c of currentConditions) {
      if (c.duration === 0) {
        // 이미 만료됨
        expired.push(c.condition);
        continue;
      }

      if (c.duration > 0) {
        // duration 감소
        remaining.push({ ...c, duration: c.duration - 1 });
      } else {
        // -1 (영구) 유지
        remaining.push(c);
      }
    }

    return { conditions: remaining, expired };
  }

  // ─── 턴 종료 시 세이빙 스로우 ─────────────────────

  // 턴 종료 시 세이빙 스로우로 해제 시도
  processEndOfTurn(
    currentConditions: AppliedCondition[],
    abilityScores: Record<AbilityType, number>,
    proficiencyBonus: number = 0,
  ): { conditions: AppliedCondition[]; saved: Condition[]; failed: Condition[] } {
    const saved: Condition[] = [];
    const failed: Condition[] = [];
    const remaining: AppliedCondition[] = [];

    for (const c of currentConditions) {
      // 세이빙 스로우 DC가 있는 영구 상태이상만 체크
      if (c.saveDC && c.saveAbility && c.duration === -1) {
        const abilityScore = abilityScores[c.saveAbility] ?? 10;
        const saveResult = this.diceEngine.skillCheck(abilityScore, proficiencyBonus);

        if (saveResult.total >= c.saveDC) {
          saved.push(c.condition);
          continue; // 해제 성공
        } else {
          failed.push(c.condition);
        }
      }

      remaining.push(c);
    }

    return { conditions: remaining, saved, failed };
  }

  // ─── 상태이상 확인 ────────────────────────────────

  hasCondition(conditions: AppliedCondition[], condition: Condition): boolean {
    return conditions.some((c) => c.condition === condition);
  }

  getActiveConditions(conditions: AppliedCondition[]): Condition[] {
    return [...new Set(conditions.map((c) => c.condition))];
  }

  // ─── 전투 관련 효과 확인 ──────────────────────────

  // 공격 시 이점/불리 계산
  getAttackAdvantage(
    attackerConditions: AppliedCondition[],
    targetConditions: AppliedCondition[],
  ): boolean | undefined {
    let hasAdvantage = false;
    let hasDisadvantage = false;

    // 공격자 상태에 따른 효과
    if (this.hasCondition(attackerConditions, 'invisible')) hasAdvantage = true;
    if (this.hasCondition(attackerConditions, 'blinded')) hasDisadvantage = true;
    if (this.hasCondition(attackerConditions, 'frightened')) hasDisadvantage = true;
    if (this.hasCondition(attackerConditions, 'poisoned')) hasDisadvantage = true;
    if (this.hasCondition(attackerConditions, 'prone')) hasDisadvantage = true;
    if (this.hasCondition(attackerConditions, 'restrained')) hasDisadvantage = true;

    // 대상 상태에 따른 효과
    if (this.hasCondition(targetConditions, 'blinded')) hasAdvantage = true;
    if (this.hasCondition(targetConditions, 'paralyzed')) hasAdvantage = true;
    if (this.hasCondition(targetConditions, 'stunned')) hasAdvantage = true;
    if (this.hasCondition(targetConditions, 'unconscious')) hasAdvantage = true;
    if (this.hasCondition(targetConditions, 'restrained')) hasAdvantage = true;
    if (this.hasCondition(targetConditions, 'prone')) hasAdvantage = true;
    if (this.hasCondition(targetConditions, 'invisible')) hasDisadvantage = true;

    // 이점과 불리가 모두 있으면 상쇄 (보통 굴림)
    if (hasAdvantage && hasDisadvantage) return undefined;
    if (hasAdvantage) return true;
    if (hasDisadvantage) return false;
    return undefined;
  }

  // 행동 불가 상태인지 확인
  isIncapacitated(conditions: AppliedCondition[]): boolean {
    return (
      this.hasCondition(conditions, 'incapacitated') ||
      this.hasCondition(conditions, 'paralyzed') ||
      this.hasCondition(conditions, 'petrified') ||
      this.hasCondition(conditions, 'stunned') ||
      this.hasCondition(conditions, 'unconscious')
    );
  }

  // ─── 직렬화 / 역직렬화 ────────────────────────────

  serialize(conditions: AppliedCondition[]): string {
    return JSON.stringify(conditions);
  }

  deserialize(data: string): AppliedCondition[] {
    return JSON.parse(data) as AppliedCondition[];
  }
}
