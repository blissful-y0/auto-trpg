// 전투 시스템 모듈 re-export

export { DamageCalculator } from './DamageCalculator';
export { ConditionTracker } from './ConditionTracker';
export { EnhancedCombatManager } from './EnhancedCombatManager';
export type { EnhancedParticipant } from './EnhancedCombatManager';
export { CombatPromptBuilder } from './CombatPromptBuilder';
export { CONDITION_NAMES_KO } from './types';
export type {
  Condition,
  AppliedCondition,
  DamageType,
  AbilityType,
  AttackResult,
  DamageInput,
  EnhancedCombatant,
  EnhancedCombatState,
  CombatLogEntry,
  SerializedCombatant,
} from './types';
