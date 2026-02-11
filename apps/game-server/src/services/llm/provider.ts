/**
 * LLM 프로바이더 공통 인터페이스 및 타입 정의
 *
 * shared-types 패키지가 아직 빌드되지 않았으므로 로컬에 인라인 정의.
 * 추후 shared-types 패키지로 이전 예정.
 */

// ── 프로바이더 식별자 ──
export type LLMProviderId = 'claude' | 'openai' | 'gemini';

// ── 작업 유형 (라우터에서 사용) ──
export type TaskType =
  | 'gm_response'
  | 'intervention_check'
  | 'summarize'
  | 'embedding'
  | 'rerank';

// ── 메시지 역할 ──
export type MessageRole = 'system' | 'user' | 'assistant';

// ── 메시지 ──
export interface LLMMessage {
  role: MessageRole;
  content: string;
}

// ── Tool 정의 ──
export interface LLMToolDefinition {
  name: string;
  description: string;
  /** JSON Schema 형태의 파라미터 정의 */
  parameters: Record<string, unknown>;
}

// ── 요청 ──
export interface LLMRequest {
  messages: LLMMessage[];
  model?: string;
  maxTokens?: number;
  temperature?: number;
  /** Tool 정의 목록 (generateWithTools에서 사용) */
  tools?: LLMToolDefinition[];
  /** 시스템 프롬프트 (별도 지정 시 messages의 system 역할과 합산) */
  systemPrompt?: string;
}

// ── 응답 ──
export interface LLMResponse {
  content: string;
  model: string;
  usage: TokenUsage;
  finishReason: string;
}

// ── 스트리밍 청크 ──
export interface LLMStreamChunk {
  content: string;
  /** 마지막 청크 여부 */
  done: boolean;
  /** 마지막 청크에만 포함되는 사용량 */
  usage?: TokenUsage;
}

// ── Tool 호출 결과 ──
export interface LLMToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

// ── Tool 응답 ──
export interface LLMToolResponse {
  content: string;
  toolCalls: LLMToolCall[];
  model: string;
  usage: TokenUsage;
  finishReason: string;
}

// ── 토큰 사용량 ──
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

// ── 모델 라우팅 설정 ──
export interface ModelRouting {
  providerId: LLMProviderId;
  model: string;
  /** 해당 작업에 대한 우선순위 (낮을수록 높은 우선순위) */
  priority: number;
}

// ── LLM 프로바이더 인터페이스 ──
export interface LLMProvider {
  readonly providerId: LLMProviderId;

  /** 텍스트 생성 */
  generateText(request: LLMRequest): Promise<LLMResponse>;

  /** 스트리밍 생성 */
  generateStream(request: LLMRequest): AsyncGenerator<LLMStreamChunk>;

  /** Tool Use (구조화 출력) */
  generateWithTools(request: LLMRequest): Promise<LLMToolResponse>;

  /** 토큰 카운팅 (근사치) */
  countTokens(text: string): number;

  /** API 키 유효성 검증 */
  validateKey(apiKey: string): Promise<boolean>;
}
