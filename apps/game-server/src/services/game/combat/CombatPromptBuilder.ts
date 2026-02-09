// 전투 전용 LLM 프롬프트 블록 생성기 — ContextManager Tier 0 삽입용

import { CONDITION_NAMES_KO } from './types';
import type { EnhancedCombatState, EnhancedCombatant } from './types';

export class CombatPromptBuilder {
  // 전투 상태 텍스트 블록 생성 (Tier 0 삽입용)
  buildCombatBlock(state: EnhancedCombatState): string {
    if (!state.isActive) return '';

    const lines: string[] = [
      '=== 현재 전투 상태 ===',
      `라운드: ${state.round}`,
      `현재 턴: ${state.combatants[state.currentTurnIndex]?.name ?? '없음'}`,
      '',
      '참가자 (이니셔티브 순):',
    ];

    for (let i = 0; i < state.combatants.length; i++) {
      const c = state.combatants[i];
      const turnMarker = i === state.currentTurnIndex ? '▶ ' : '  ';
      const status = this.formatCombatantStatus(c);
      lines.push(`${turnMarker}${status}`);
    }

    // 최근 전투 로그 (최근 5개)
    if (state.log.length > 0) {
      lines.push('');
      lines.push('최근 전투 기록:');
      const recentLog = state.log.slice(-5);
      for (const entry of recentLog) {
        lines.push(`  [R${entry.round}] ${entry.actorName}: ${entry.action} → ${entry.result}`);
      }
    }

    lines.push('=== 전투 상태 끝 ===');
    return lines.join('\n');
  }

  // 개별 참가자 상태 포맷
  private formatCombatantStatus(c: EnhancedCombatant): string {
    const hpBar = this.formatHPBar(c.hpCurrent, c.hpMax);
    const side = c.isPlayer ? '아군' : '적';
    const conditionStr = this.formatConditions(c);

    let line = `${c.name} (${side}) | 이니셔티브 ${c.initiative} | HP ${hpBar} | AC ${c.armorClass}`;

    if (conditionStr) {
      line += ` | 상태: ${conditionStr}`;
    }

    if (c.hpCurrent <= 0) {
      line += ' [쓰러짐]';
    }

    return line;
  }

  // HP 바 텍스트 포맷
  private formatHPBar(current: number, max: number): string {
    return `${current}/${max}`;
  }

  // 상태이상 포맷
  private formatConditions(c: EnhancedCombatant): string {
    if (c.conditions.length === 0) return '';
    const names = c.conditions.map((cond) => {
      const name = CONDITION_NAMES_KO[cond.condition] ?? cond.condition;
      if (cond.duration > 0) return `${name}(${cond.duration}턴)`;
      return name;
    });
    return names.join(', ');
  }

  // 간략한 전투 요약 (상태 업데이트 메시지용)
  buildCombatSummary(state: EnhancedCombatState): string {
    const alivePlayers = state.combatants.filter((c) => c.isPlayer && c.hpCurrent > 0).length;
    const totalPlayers = state.combatants.filter((c) => c.isPlayer).length;
    const aliveEnemies = state.combatants.filter((c) => !c.isPlayer && c.hpCurrent > 0).length;
    const totalEnemies = state.combatants.filter((c) => !c.isPlayer).length;

    return `라운드 ${state.round} | 아군 ${alivePlayers}/${totalPlayers} | 적 ${aliveEnemies}/${totalEnemies}`;
  }
}
