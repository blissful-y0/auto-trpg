// 컨텍스트 관리 및 GM 개입 판단 타입 정의

import type { GameSessionId, MessageId } from './game';

// ─── 메모리 계층 ────────────────────────────────────────

/** 메모리 계층 (0: 즉시, 1: 씬, 2: 세션, 3: 장기) */
export type MemoryTier = 0 | 1 | 2 | 3;

/** 컨텍스트 예산 (각 계층별 토큰 수) */
export interface ContextBudget {
  tier0: number;
  tier1: number;
  tier2: number;
  tier3: number;
  total: number;
}

/** 예산 프로필 (상황별 토큰 배분 전략) */
export type BudgetProfile = 'combat' | 'exploration' | 'roleplay' | 'skill_check';

/** 컨텍스트 블록 (프롬프트에 삽입될 단위) */
export interface ContextBlock {
  tier: MemoryTier;
  content: string;
  tokenCount: number;
  priority: number;
  source: string;
}

// ─── 요약 ───────────────────────────────────────────────

/** 장면 요약 */
export interface SceneSummary {
  id: string;
  sessionId: GameSessionId;
  sceneNumber: number;
  summary: string;
  keyEvents: string[];
  embedding: number[];
  startMessageId: MessageId;
  endMessageId: MessageId;
  createdAt: string;
}

/** 세션 요약 */
export interface SessionSummary {
  id: string;
  sessionId: GameSessionId;
  summary: string;
  keyDecisions: string[];
  embedding: number[];
  createdAt: string;
}

// ─── 스냅샷 ─────────────────────────────────────────────

/** 스냅샷 생성 트리거 */
export type SnapshotTrigger = 'manual' | 'auto' | 'scene_change';

/** 세션 스냅샷 (복원 가능한 전체 상태) */
export interface SessionSnapshot {
  id: string;
  sessionId: GameSessionId;
  gameState: Record<string, unknown>;
  characters: Record<string, unknown>;
  combatState: Record<string, unknown> | null;
  messageCount: number;
  createdAt: string;
  trigger: SnapshotTrigger;
}

// ─── GM 개입 판단 ───────────────────────────────────────

/** GM 적극성 수준 */
export type GMAggressiveness = 'passive' | 'balanced' | 'active';

/** 개입 긴급도 */
export type InterventionUrgency = 'immediate' | 'after_rp' | 'background' | 'none';

/** 개입 유형 */
export type InterventionType =
  | 'narration'
  | 'npc_response'
  | 'rule_check'
  | 'environment'
  | 'story_advance';

/** GM 개입 판단 결과 */
export interface InterventionDecision {
  shouldIntervene: boolean;
  reason: string;
  urgency: InterventionUrgency;
  interventionType: InterventionType;
}
