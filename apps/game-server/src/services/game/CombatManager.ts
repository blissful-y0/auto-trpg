// 전투 관리자 — 이니셔티브, 턴 순서, 전투 상태 관리

import { DiceEngine } from './DiceEngine';

export interface CombatParticipant {
  characterId: string;
  name: string;
  dexterityScore: number;
  isPlayer: boolean;
}

export interface CombatantInit {
  characterId: string;
  name: string;
  initiative: number;
  isPlayer: boolean;
}

export interface CombatState {
  sessionId: string;
  isActive: boolean;
  round: number;
  currentTurnIndex: number;
  combatants: CombatantInit[];
}

export class CombatManager {
  constructor(private diceEngine: DiceEngine) {}

  // 전투 시작 — 참가자 이니셔티브 굴림 후 정렬
  startCombat(sessionId: string, participants: CombatParticipant[]): CombatState {
    const combatants: CombatantInit[] = participants.map((p) => {
      const modifier = this.diceEngine.getModifier(p.dexterityScore);
      const roll = this.diceEngine.roll('d20', 1, modifier);
      return {
        characterId: p.characterId,
        name: p.name,
        initiative: roll.total,
        isPlayer: p.isPlayer,
      };
    });

    return {
      sessionId,
      isActive: true,
      round: 1,
      currentTurnIndex: 0,
      combatants: this.sortInitiative(combatants),
    };
  }

  // 다음 턴으로 진행
  nextTurn(combatState: CombatState): CombatState {
    const nextIndex = combatState.currentTurnIndex + 1;

    if (nextIndex >= combatState.combatants.length) {
      // 라운드 종료 → 새 라운드
      return {
        ...combatState,
        round: combatState.round + 1,
        currentTurnIndex: 0,
      };
    }

    return {
      ...combatState,
      currentTurnIndex: nextIndex,
    };
  }

  // 전투 종료
  endCombat(combatState: CombatState): CombatState {
    return {
      ...combatState,
      isActive: false,
    };
  }

  // 이니셔티브 내림차순 정렬
  sortInitiative(combatants: CombatantInit[]): CombatantInit[] {
    return [...combatants].sort((a, b) => b.initiative - a.initiative);
  }

  // 현재 턴의 캐릭터 반환
  getCurrentTurnCharacter(combatState: CombatState): CombatantInit {
    return combatState.combatants[combatState.currentTurnIndex];
  }
}
