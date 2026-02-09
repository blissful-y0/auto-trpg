// LLM 프로바이더 및 GM 응답 타입 정의

import type { DiceRoll } from './game';

// ─── LLM 프로바이더 ─────────────────────────────────────

/** LLM 프로바이더 식별자 */
export type LLMProviderId = 'claude' | 'openai' | 'gemini';

/** LLM 프로바이더 설정 */
export interface LLMProviderConfig {
  providerId: LLMProviderId;
  model: string;
  maxTokens: number;
  temperature: number;
  topP: number;
}

// ─── LLM 요청/응답 ──────────────────────────────────────

/** LLM 메시지 역할 */
export type LLMMessageRole = 'system' | 'user' | 'assistant';

/** LLM 메시지 */
export interface LLMMessage {
  role: LLMMessageRole;
  content: string;
}

/** LLM 도구 정의 (JSON Schema 기반) */
export interface LLMTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/** LLM 도구 호출 */
export interface LLMToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/** LLM 요청 */
export interface LLMRequest {
  messages: LLMMessage[];
  config: LLMProviderConfig;
  tools?: LLMTool[];
  stream?: boolean;
}

/** 토큰 사용량 */
export interface LLMUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/** LLM 응답 종료 사유 */
export type FinishReason = 'stop' | 'max_tokens' | 'tool_calls' | 'error';

/** LLM 응답 */
export interface LLMResponse {
  content: string;
  usage: LLMUsage;
  model: string;
  finishReason: FinishReason;
}

/** LLM 스트리밍 청크 */
export interface LLMStreamChunk {
  delta: string;
  finishReason: FinishReason | null;
}

// ─── GM 구조화 출력 (Tool Use) ──────────────────────────

/** 상태 변경 */
export interface StateChange {
  targetId: string;
  field: string;
  oldValue: unknown;
  newValue: unknown;
  reason: string;
}

/** 규칙 참조 */
export interface RuleReference {
  source: string;
  page: number;
  quote: string;
}

/** 장면 전환 */
export interface SceneTransition {
  newScene: string;
  description: string;
}

/** GM 응답 (구조화된 출력) */
export interface GMResponse {
  narrative: string;
  stateChanges: StateChange[];
  diceRolls: DiceRoll[];
  rulesApplied: RuleReference[];
  sceneTransition: SceneTransition | null;
}

// ─── BYOK API 키 ────────────────────────────────────────

/** 사용자 API 키 (암호화 저장) */
export interface UserAPIKey {
  id: string;
  userId: string;
  provider: LLMProviderId;
  encryptedKey: string;
  iv: string;
  authTag: string;
  keyHint: string;
  isValid: boolean;
  createdAt: string;
  updatedAt: string;
}

// ─── 모델 라우팅 ────────────────────────────────────────

/** 작업 유형 (모델 라우팅용) */
export type TaskType =
  | 'gm_response'
  | 'intervention_check'
  | 'summarize'
  | 'state_extract'
  | 'embedding'
  | 'rulebook_parse';

/** 작업별 모델 라우팅 설정 */
export type ModelRouting = Record<TaskType, LLMProviderConfig>;
