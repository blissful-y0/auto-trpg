// GM 개입 판단 시스템 내부 타입

// GM 적극성 수준
export type GMAggressiveness = 'passive' | 'balanced' | 'active';

// 개입 긴급도
export type InterventionUrgency = 'immediate' | 'after_rp' | 'background' | 'none';

// 개입 유형
export type InterventionType =
  | 'narration'
  | 'npc_response'
  | 'rule_check'
  | 'environment'
  | 'story_advance';

// GM 개입 판단 결과
export interface InterventionDecision {
  shouldIntervene: boolean;
  reason: string;
  urgency: InterventionUrgency;
  interventionType: InterventionType;
}

// 1단계 규칙 필터 결과
export type RuleFilterResult = 'bypass' | 'pass' | 'classify';

// 개입 판단 입력
export interface InterventionInput {
  sessionId: string;
  characterId: string;
  userId: string;
  message: string;
  isOOC: boolean;
  aggressiveness: GMAggressiveness;
  recentMessages?: Array<{ role: string; content: string }>;
  combatActive?: boolean;
}
