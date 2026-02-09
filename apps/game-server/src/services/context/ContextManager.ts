// 컨텍스트 매니저 v1 — LLM 프롬프트 조립, 메시지 관리
// v1.1: MemoryHierarchy 통합 (optional)

import type { MemoryHierarchy } from '../memory/MemoryHierarchy';
import type { BudgetProfile } from '../memory/types';

// LLM 메시지 타입
export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// 게임 세션 정보
export interface GameSessionInfo {
  sessionId: string;
  campaignName: string;
  rulebookIds: string[];
  setting: string;
  tone: string;
}

// 캐릭터 정보
export interface CharacterInfo {
  characterId: string;
  name: string;
  race: string;
  class: string;
  level: number;
  hp: { current: number; max: number };
  abilities: Record<string, number>;
  skills: string[];
  inventory: string[];
  conditions: string[];
}

// 플레이어 액션
export interface PlayerAction {
  sessionId: string;
  characterId: string;
  userId: string;
  message: string;
  isOOC: boolean;
}

// 메시지 저장 입력
export interface MessageInput {
  role: 'user' | 'assistant' | 'system';
  content: string;
  characterId?: string;
  userId?: string;
}

// 게임 이벤트 입력
export interface GameEventInput {
  type: string;
  data: Record<string, unknown>;
  description: string;
}

// GM 페르소나 시스템 프롬프트 템플릿
const GM_SYSTEM_PROMPT = `당신은 TRPG 게임 마스터(GM)입니다. 아래 규칙에 따라 게임을 진행하세요.

## 역할
- 플레이어의 행동에 대해 규칙에 기반한 판정을 수행합니다.
- 풍부한 내러티브로 게임 세계를 묘사합니다.
- NPC를 역할극하고, 전투를 관리합니다.

## 응답 형식
반드시 구조화된 형식으로 응답하세요:
- narrative: 내러티브 텍스트 (플레이어에게 보여줄 이야기)
- stateChanges: 상태 변경 배열 (HP 변경, 아이템 획득 등)
- diceRolls: 필요한 주사위 굴림
- rulesApplied: 적용한 규칙 출처 (페이지, 인용)

## 원칙
- 규칙서에 명시된 규칙만 적용합니다. 환각하지 마세요.
- 플레이어 캐릭터의 행동을 대신 결정하지 마세요.
- 공정하고 일관된 판정을 유지하세요.`;

// 기본 토큰 예산 (128k 컨텍스트 기준)
const DEFAULT_MAX_TOKENS = 120000;
const DEFAULT_MESSAGE_LIMIT = 30;

// 간이 토큰 추정 (영어 ~4자/토큰, 한국어 ~2자/토큰, 평균 ~3자/토큰)
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3);
}

export class ContextManager {
  // 메시지 저장소 (세션별)
  private messageStore: Map<string, MessageInput[]> = new Map();

  // 이벤트 로그 (세션별)
  private eventStore: Map<string, GameEventInput[]> = new Map();

  // 메모리 계층 시스템 (optional)
  private memoryHierarchy?: MemoryHierarchy | null;

  constructor(memoryHierarchy?: MemoryHierarchy | null) {
    this.memoryHierarchy = memoryHierarchy;
  }

  // LLM 프롬프트 조립 (핵심)
  async buildPrompt(
    session: GameSessionInfo,
    action: PlayerAction,
    characters: CharacterInfo[],
    budgetProfile?: BudgetProfile,
  ): Promise<LLMMessage[]> {
    const messages: LLMMessage[] = [];

    // Tier 0: 시스템 프롬프트
    const systemPrompt = this.buildSystemPrompt(session);
    messages.push({ role: 'system', content: systemPrompt });

    // Tier 0: 캐릭터 시트
    if (characters.length > 0) {
      const charSheet = this.formatCharacters(characters);
      messages.push({ role: 'system', content: `## 활성 캐릭터 정보\n${charSheet}` });
    }

    // Tier 0: 규칙 검색 결과 (RAG — 현재 스텁)
    const rules = await this.getRelevantRules(action.message, session.rulebookIds);
    if (rules) {
      messages.push({ role: 'system', content: `## 관련 규칙\n${rules}` });
    }

    // Tier 1: 최근 메시지 (슬라이딩 윈도우)
    const recentMessages = await this.getRecentMessages(action.sessionId);
    messages.push(...recentMessages);

    // Tier 2/3: MemoryHierarchy 통합 (있을 때만)
    if (this.memoryHierarchy && budgetProfile) {
      const tier0Content = messages.filter((m) => m.role === 'system').map((m) => m.content);
      const tier1Content = recentMessages.map((m) => m.content);

      const tiered = this.memoryHierarchy.buildTieredContext(
        budgetProfile,
        tier0Content,
        tier1Content,
      );

      // Tier 2 장면 요약을 시스템 메시지에 추가
      if (tiered.tier2.length > 0) {
        messages.push({
          role: 'system',
          content: `## 이전 장면 요약\n${tiered.tier2.join('\n\n')}`,
        });
      }

      // Tier 3 세션 요약을 시스템 메시지에 추가
      if (tiered.tier3.length > 0) {
        messages.push({
          role: 'system',
          content: `## 세션 배경\n${tiered.tier3.join('\n\n')}`,
        });
      }
    }

    // 현재 플레이어 액션
    const actionPrefix = action.isOOC ? '[OOC] ' : '';
    messages.push({ role: 'user', content: `${actionPrefix}${action.message}` });

    // 토큰 예산 체크
    if (!this.checkBudget(messages, DEFAULT_MAX_TOKENS)) {
      // 예산 초과 시 최근 메시지를 줄임
      const trimmed = this.trimMessages(messages, DEFAULT_MAX_TOKENS);
      return trimmed;
    }

    return messages;
  }

  // 시스템 프롬프트 생성
  buildSystemPrompt(session: GameSessionInfo): string {
    return `${GM_SYSTEM_PROMPT}

## 캠페인 정보
- 캠페인: ${session.campaignName}
- 배경: ${session.setting}
- 톤: ${session.tone}
- 규칙서: ${session.rulebookIds.join(', ')}`;
  }

  // 규칙 검색 (RAG 스텁 — 추후 RAG 파이프라인 연동)
  async getRelevantRules(_action: string, _rulebookIds: string[]): Promise<string> {
    // TODO: RAG 파이프라인 연동 후 실제 규칙 검색
    return '';
  }

  // 캐릭터 정보를 프롬프트 형태로 변환
  formatCharacters(characters: CharacterInfo[]): string {
    return characters
      .map((c) => {
        const abilities = Object.entries(c.abilities)
          .map(([k, v]) => `${k}: ${v}`)
          .join(', ');

        return `### ${c.name} (${c.race} ${c.class} Lv.${c.level})
- HP: ${c.hp.current}/${c.hp.max}
- 능력치: ${abilities}
- 기술: ${c.skills.join(', ') || '없음'}
- 장비: ${c.inventory.join(', ') || '없음'}
- 상태: ${c.conditions.join(', ') || '정상'}`;
      })
      .join('\n\n');
  }

  // 최근 메시지 가져오기 (슬라이딩 윈도우)
  async getRecentMessages(sessionId: string, limit: number = DEFAULT_MESSAGE_LIMIT): Promise<LLMMessage[]> {
    const stored = this.messageStore.get(sessionId) || [];
    const recent = stored.slice(-limit);

    return recent.map((m) => ({
      role: m.role === 'system' ? 'assistant' : m.role,
      content: m.content,
    }));
  }

  // 토큰 예산 체크
  checkBudget(messages: LLMMessage[], maxTokens: number): boolean {
    const totalText = messages.map((m) => m.content).join('');
    const estimated = estimateTokens(totalText);
    return estimated <= maxTokens;
  }

  // 예산 초과 시 메시지 트리밍
  private trimMessages(messages: LLMMessage[], maxTokens: number): LLMMessage[] {
    // 시스템 메시지는 유지, 대화 메시지를 뒤에서부터 줄임
    const systemMessages = messages.filter((m) => m.role === 'system');
    const chatMessages = messages.filter((m) => m.role !== 'system');

    const result = [...systemMessages];
    const systemTokens = estimateTokens(systemMessages.map((m) => m.content).join(''));
    let remainingBudget = maxTokens - systemTokens;

    // 최신 메시지부터 역순으로 추가
    const selected: LLMMessage[] = [];
    for (let i = chatMessages.length - 1; i >= 0; i--) {
      const tokens = estimateTokens(chatMessages[i].content);
      if (remainingBudget - tokens < 0) break;
      remainingBudget -= tokens;
      selected.unshift(chatMessages[i]);
    }

    result.push(...selected);
    return result;
  }

  // 메시지 저장
  async saveMessage(sessionId: string, message: MessageInput): Promise<void> {
    if (!this.messageStore.has(sessionId)) {
      this.messageStore.set(sessionId, []);
    }
    this.messageStore.get(sessionId)!.push(message);
  }

  // 이벤트 로그 저장
  async saveEvent(sessionId: string, event: GameEventInput): Promise<void> {
    if (!this.eventStore.has(sessionId)) {
      this.eventStore.set(sessionId, []);
    }
    this.eventStore.get(sessionId)!.push(event);
  }
}
