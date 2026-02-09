// 메모리 계층 시스템 내부 타입

export type MemoryTier = 0 | 1 | 2 | 3;

// 컨텍스트 예산 (토큰 단위)
export interface ContextBudget {
  tier0: number;
  tier1: number;
  tier2: number;
  tier3: number;
  total: number;
}

// 예산 프로파일 (액션 유형에 따라 결정)
export type BudgetProfile = 'combat' | 'exploration' | 'roleplay' | 'skill_check';

// 장면 전환 트리거 유형
export type SceneTrigger = 'scene_transition' | 'location_change' | 'combat_end' | 'message_threshold';

// 장면 전환 감지 결과
export interface SceneDetectionResult {
  detected: boolean;
  trigger?: SceneTrigger;
  metadata?: Record<string, unknown>;
}

// 요약 요청
export interface SummarizeRequest {
  messages: Array<{ role: string; content: string }>;
  context?: string;
}

// 요약 결과
export interface SummarizeResult {
  summary: string;
  keyEvents: string[];
  tokenCount: number;
}

// 스냅샷 입력
export interface SnapshotInput {
  sessionId: string;
  gameState: Record<string, unknown>;
  characters: Record<string, unknown>;
  combatState: Record<string, unknown> | null;
  messageCount: number;
  trigger: 'manual' | 'auto' | 'scene_change';
}

// 메모리 검색 결과
export interface MemorySearchResult {
  content: string;
  similarity: number;
  source: 'scene_summary' | 'session_summary';
  metadata: Record<string, unknown>;
}

// 계층화된 컨텍스트
export interface TieredContext {
  tier0: string[];
  tier1: string[];
  tier2: string[];
  tier3: string[];
  budget: ContextBudget;
}

// 장면 전환 정보 (gmTools의 SceneTransition과 동일)
export interface SceneTransition {
  newLocation?: string;
  timeAdvance?: string;
  mood?: string;
}

// 상태 변경 정보
export interface StateChangeInfo {
  type: string;
  targetCharacterId: string;
  value: unknown;
  description?: string;
}
