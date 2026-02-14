// 게임 엔진 — 핵심 게임 루프, 액션 처리, 상태 관리

import { DiceEngine, DiceRollResult } from './DiceEngine';
import { GMResponse, StateChange, DiceRollRequest } from './gmTools';
import {
  ContextManager,
  PlayerAction,
  GameSessionInfo,
  CharacterInfo,
} from '../context/ContextManager';
import type { MemoryHierarchy } from '../memory/MemoryHierarchy';
import type { BudgetProfile } from '../memory/types';
import type { InterventionManager } from '../intervention/InterventionManager';

export type ActionType = 'combat' | 'exploration' | 'roleplay' | 'skill_check' | 'dice_roll' | 'other';

// 액션 유형 판별 키워드 매핑
const ACTION_KEYWORDS: Record<ActionType, string[]> = {
  combat: ['공격', '때리', '때린', '찌르', '찔러', '쏘', '쏜', '쏴', '베', '벤', '방어', '회피', 'attack', 'hit', 'strike', 'shoot', 'cast spell', '주문', '시전'],
  exploration: ['탐색', '조사', '살펴', '살피', '찾아', '찾는', '이동', '열어', '열었', 'search', 'explore', 'investigate', 'move', 'open', 'look'],
  roleplay: ['말하', '말한', '말해', '대화', '설득', '위협', '거짓말', 'say', 'talk', 'persuade', 'intimidate', 'deceive', 'speak'],
  skill_check: ['체크', '판정', '시도', 'check', 'attempt', 'try to', '굴려', '성공'],
  dice_roll: ['주사위', 'roll', 'd20', 'd6', 'd8', 'd10', 'd12', 'd4', 'd100'],
  other: [],
};

// ActionType → BudgetProfile 매핑
function getBudgetProfile(actionType: ActionType): BudgetProfile {
  const mapping: Record<ActionType, BudgetProfile> = {
    combat: 'combat',
    exploration: 'exploration',
    roleplay: 'roleplay',
    skill_check: 'skill_check',
    dice_roll: 'skill_check',
    other: 'exploration',
  };
  return mapping[actionType];
}


// 비숫자 수정치를 제거하고 유효한 주사위 표기법으로 정리
function sanitizeDiceNotation(notation: string): string {
  const trimmed = notation.trim();

  // 이미 유효한 표기법이면 그대로 반환
  if (/^\d*d\d+([+-]\d+)?$/i.test(trimmed)) {
    return trimmed;
  }

  // 비숫자 수정치 패턴 감지: "1d20+religion_modifier", "2d6+str_bonus" 등
  const partialMatch = trimmed.match(/^(\d*d\d+)[+-][a-zA-Z_]+.*$/i);
  if (partialMatch) {
    // 수정치 부분을 제거하고 주사위만 반환
    return partialMatch[1];
  }

  return trimmed;
}

export class GameEngine {
  constructor(
    private contextManager: ContextManager,
    private llmRouter: { call: (messages: unknown[], tools: unknown[]) => Promise<GMResponse> } | null,
    private diceEngine: DiceEngine,
    private memoryHierarchy?: MemoryHierarchy | null,
    private interventionManager?: InterventionManager | null,
  ) {}

  // 플레이어 액션 처리 (핵심 게임 루프)
  async processAction(
    session: GameSessionInfo,
    characters: CharacterInfo[],
    action: PlayerAction,
  ): Promise<GMResponse> {
    // 0. 개입 판단 (InterventionManager가 있을 때만)
    if (this.interventionManager) {
      const decision = await this.interventionManager.evaluate({
        sessionId: action.sessionId,
        characterId: action.characterId,
        userId: action.userId,
        message: action.message,
        isOOC: action.isOOC,
        aggressiveness: 'balanced', // 세션 설정에서 가져올 예정
      });

      if (!decision.shouldIntervene) {
        // 개입하지 않을 경우 메시지만 저장하고 빈 응답
        await this.contextManager.saveMessage(action.sessionId, {
          role: 'user',
          content: action.message,
          characterId: action.characterId,
          userId: action.userId,
        });
        return { narrative: '' }; // 빈 내러티브 = GM 침묵
      }
    }

    // 1. 액션 유형 판별
    const actionType = this.classifyAction(action.message);

    // 2. 직접 주사위 굴림 요청인 경우 바로 처리
    if (actionType === 'dice_roll' && this.isDirectDiceRoll(action.message)) {
      const notation = this.extractDiceNotation(action.message);
      if (notation) {
        const result = this.diceEngine.rollNotation(notation);
        return {
          narrative: `🎲 ${notation} 굴림 결과: [${result.rolls.join(', ')}] = **${result.total}**${
            result.isCritical ? ' ✨ 크리티컬!' : ''
          }${result.isFumble ? ' 💀 펌블!' : ''}`,
        };
      }
    }

    // 3. ContextManager로 LLM 프롬프트 조립 (budgetProfile 전달)
    const budgetProfile = getBudgetProfile(actionType);
    const messages = await this.contextManager.buildPrompt(session, action, characters, budgetProfile);

    // 4. 메시지 저장
    await this.contextManager.saveMessage(action.sessionId, {
      role: 'user',
      content: action.message,
      characterId: action.characterId,
      userId: action.userId,
    });

    // 5. LLM 호출 (미연동 시 기본 응답)
    if (!this.llmRouter) {
      const fallback: GMResponse = {
        narrative: `[LLM 미연동] "${action.message}" 액션을 받았습니다. (유형: ${actionType})`,
      };
      await this.contextManager.saveMessage(action.sessionId, {
        role: 'assistant',
        content: fallback.narrative,
      });
      return fallback;
    }

    // LLM 호출 (구조화 출력 Tool Use)
    const { GM_TOOLS } = await import('./gmTools');
    const gmResponse = await this.llmRouter.call(messages, [...GM_TOOLS]);

    // 6. 주사위 제안 처리 (GM은 제안만, 실제 굴림은 유저가 수행)
    if (gmResponse.diceRolls && gmResponse.diceRolls.length > 0) {
      gmResponse.diceRolls = gmResponse.diceRolls.map((r) => ({
        ...r,
        notation: sanitizeDiceNotation(r.notation),
      }));
    }

    // 7. 상태 변경 검증 + 적용 (LLM 환각 방지)
    if (gmResponse.stateChanges && gmResponse.stateChanges.length > 0) {
      gmResponse.stateChanges = this.validateStateChanges(gmResponse.stateChanges, characters);
      if (gmResponse.stateChanges.length > 0) {
        await this.applyStateChanges(action.sessionId, gmResponse.stateChanges);
      }
    }

    // 8. GM 응답 저장
    await this.contextManager.saveMessage(action.sessionId, {
      role: 'assistant',
      content: gmResponse.narrative,
    });

    // 9. 이벤트 로그
    await this.contextManager.saveEvent(action.sessionId, {
      type: actionType,
      data: { action: action.message, response: gmResponse.narrative },
      description: `플레이어 액션 처리: ${actionType}`,
    });

    // 10. 메모리 계층 후처리 (장면 전환 감지 및 요약)
    if (this.memoryHierarchy) {
      const storedMessages = await this.contextManager.getRecentMessages(action.sessionId);
      await this.memoryHierarchy.onPostResponse(action.sessionId, {
        sceneTransition: gmResponse.sceneTransition ?? undefined,
        stateChanges: gmResponse.stateChanges?.map((c) => ({
          type: c.type,
          targetCharacterId: c.targetCharacterId,
          value: c.value,
          description: c.description,
        })),
        messageCount: storedMessages.length,
        recentMessages: storedMessages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      });
    }

    return gmResponse;
  }

  // 액션 유형 분류
  classifyAction(message: string): ActionType {
    const lowerMsg = message.toLowerCase();

    let bestType: ActionType = 'other';
    let bestScore = 0;

    for (const [type, keywords] of Object.entries(ACTION_KEYWORDS)) {
      if (type === 'other') continue;
      const score = keywords.filter((kw) => lowerMsg.includes(kw.toLowerCase())).length;
      if (score > bestScore) {
        bestScore = score;
        bestType = type as ActionType;
      }
    }

    return bestType;
  }

  // 상태 변경 검증 — LLM 환각 방지
  validateStateChanges(changes: StateChange[], characters: CharacterInfo[]): StateChange[] {
    const characterIds = new Set(characters.map((c) => c.characterId));
    const validTypes = new Set<string>([
      'hp_change', 'item_add', 'item_remove', 'condition_add',
      'condition_remove', 'xp_gain', 'gold_change', 'location_change',
    ]);

    return changes.filter((change) => {
      // 유효한 변경 유형인지 확인
      if (!validTypes.has(change.type)) {
        console.warn(`[GameEngine] 유효하지 않은 상태 변경 유형 무시: "${change.type}"`);
        return false;
      }

      // 대상 캐릭터가 세션에 존재하는지 확인
      if (!characterIds.has(change.targetCharacterId)) {
        console.warn(
          `[GameEngine] 존재하지 않는 캐릭터 ID 무시: "${change.targetCharacterId}"`,
        );
        return false;
      }

      // HP 변경: 숫자 검증 + 0~maxHp 범위 클램핑
      if (change.type === 'hp_change') {
        if (typeof change.value !== 'number') {
          console.warn(`[GameEngine] hp_change 값이 숫자가 아님, 무시: ${change.value}`);
          return false;
        }
        const character = characters.find((c) => c.characterId === change.targetCharacterId);
        if (character) {
          const newHp = character.hp.current + change.value;
          const clamped = Math.max(0, Math.min(newHp, character.hp.max));
          change.value = clamped - character.hp.current;
        }
      }

      // XP/Gold 변경: 숫자 검증 + 합리적 범위 제한
      if (change.type === 'xp_gain' || change.type === 'gold_change') {
        if (typeof change.value !== 'number') {
          console.warn(`[GameEngine] ${change.type} 값이 숫자가 아님, 무시: ${change.value}`);
          return false;
        }
        const MAX_SINGLE_CHANGE = 10000;
        if (Math.abs(change.value) > MAX_SINGLE_CHANGE) {
          console.warn(
            `[GameEngine] ${change.type} 값 범위 초과 (${change.value}), ${MAX_SINGLE_CHANGE}으로 클램핑`,
          );
          change.value = Math.sign(change.value) * MAX_SINGLE_CHANGE;
        }
      }

      // 문자열 값 필요 유형: 빈 문자열 방지
      if (['item_add', 'item_remove', 'condition_add', 'condition_remove', 'location_change'].includes(change.type)) {
        if (typeof change.value !== 'string' || change.value.trim().length === 0) {
          console.warn(`[GameEngine] ${change.type} 값이 유효한 문자열이 아님, 무시`);
          return false;
        }
      }

      return true;
    });
  }

  // 상태 변경 적용
  async applyStateChanges(sessionId: string, changes: StateChange[]): Promise<void> {
    for (const change of changes) {
      await this.contextManager.saveEvent(sessionId, {
        type: `state_change:${change.type}`,
        data: {
          targetCharacterId: change.targetCharacterId,
          value: change.value,
        },
        description: change.description || `${change.type} 변경`,
      });
    }
  }

  // 주사위 굴림 요청 처리
  handleDiceRoll(request: DiceRollRequest): DiceRollResult {
    return this.diceEngine.rollNotation(request.notation);
  }

  // 직접 주사위 굴림 메시지인지 판단
  private isDirectDiceRoll(message: string): boolean {
    return /^\s*(roll\s+)?(\d+)?d\d+([+-]\d+)?\s*$/i.test(message.trim());
  }

  // 메시지에서 주사위 표기법 추출
  private extractDiceNotation(message: string): string | null {
    const match = message.match(/(\d+)?d\d+([+-]\d+)?/i);
    return match ? match[0] : null;
  }
}
