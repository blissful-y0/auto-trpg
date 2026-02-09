// 게임 도메인 타입 정의

// ─── 기본 ID 타입 ───────────────────────────────────────
export type GameSessionId = string;
export type CharacterId = string;
export type UserId = string;
export type RulebookId = string;
export type MessageId = string;
export type GameEventId = string;

// ─── 게임 세션 ──────────────────────────────────────────

/** 게임 세션 상태 */
export type GameSessionStatus = 'waiting' | 'active' | 'paused' | 'completed';

/** GM 성격(개입 수준) */
export type GMPersonality = 'passive' | 'balanced' | 'active';

/** 게임 세션 설정 */
export interface GameSessionSettings {
  rulebookIds: RulebookId[];
  primaryProvider: LLMProviderIdRef;
  gmPersonality: GMPersonality;
  language: string;
}

/** LLM 프로바이더 ID 참조 (순환 참조 방지) */
type LLMProviderIdRef = 'claude' | 'openai' | 'gemini';

/** 월드 상태 */
export interface WorldState {
  currentLocation: string;
  timeOfDay: string;
  weather: string;
  activeNPCs: string[];
  customData: Record<string, unknown>;
}

/** 게임 세션 */
export interface GameSession {
  id: GameSessionId;
  name: string;
  status: GameSessionStatus;
  maxPlayers: number;
  currentScene: string;
  worldState: WorldState;
  settings: GameSessionSettings;
  createdBy: UserId;
  createdAt: string;
  updatedAt: string;
}

// ─── 세션 참가자 ────────────────────────────────────────

/** 참가자 역할 */
export type ParticipantRole = 'player' | 'observer';

/** 세션 참가자 */
export interface SessionParticipant {
  id: string;
  sessionId: GameSessionId;
  userId: UserId;
  characterId: CharacterId | null;
  role: ParticipantRole;
  joinedAt: string;
}

// ─── 캐릭터 ─────────────────────────────────────────────

/** 캐릭터 상태 */
export type CharacterStatus = 'active' | 'dead' | 'retired';

/** 능력치 점수 (값 + 자동 계산 보정치) */
export interface AbilityScore {
  value: number;
  modifier: number;
}

/** 캐릭터 기본 능력치 */
export interface CharacterStats {
  strength: AbilityScore;
  dexterity: AbilityScore;
  constitution: AbilityScore;
  intelligence: AbilityScore;
  wisdom: AbilityScore;
  charisma: AbilityScore;
  [key: string]: AbilityScore;
}

/** HP 정보 */
export interface HitPoints {
  current: number;
  max: number;
  temp: number;
}

/** 캐릭터 */
export interface Character {
  id: CharacterId;
  sessionId: GameSessionId;
  userId: UserId;
  name: string;
  race: string;
  class: string;
  level: number;
  stats: CharacterStats;
  hitPoints: HitPoints;
  armorClass: number;
  inventory: string[];
  abilities: string[];
  backstory: string;
  status: CharacterStatus;
}

// ─── 메시지 / 이벤트 ────────────────────────────────────

/** 메시지 발신자 유형 */
export type SenderType = 'player' | 'gm' | 'system';

/** 메시지 메타데이터 */
export interface MessageMetadata {
  diceRolls?: DiceRoll[];
  rulesApplied?: string[];
  stateChanges?: Record<string, unknown>[];
  interventionType?: string;
}

/** 메시지 */
export interface Message {
  id: MessageId;
  sessionId: GameSessionId;
  senderId: string;
  senderType: SenderType;
  content: string;
  metadata: MessageMetadata;
  createdAt: string;
}

// ─── 주사위 ─────────────────────────────────────────────

/** 주사위 종류 */
export type DiceType = 'd4' | 'd6' | 'd8' | 'd10' | 'd12' | 'd20' | 'd100';

/** 이점/불리 */
export type AdvantageType = 'advantage' | 'disadvantage' | 'none';

/** 주사위 굴림 결과 */
export interface DiceRoll {
  dice: DiceType;
  count: number;
  modifier: number;
  advantageType: AdvantageType;
  results: number[];
  total: number;
}

// ─── 게임 이벤트 ────────────────────────────────────────

/** 게임 이벤트 유형 */
export type GameEventType =
  | 'dice_roll'
  | 'state_change'
  | 'scene_change'
  | 'combat_start'
  | 'combat_end'
  | 'character_join'
  | 'character_leave'
  | 'level_up'
  | 'item_acquired'
  | 'npc_interaction';

/** 게임 이벤트 */
export interface GameEvent {
  id: GameEventId;
  sessionId: GameSessionId;
  eventType: GameEventType;
  data: Record<string, unknown>;
  createdAt: string;
}

// ─── 규칙서 ─────────────────────────────────────────────

/** 규칙서 시스템 */
export type RulebookSystem = 'dnd5e' | 'pathfinder' | 'custom' | string;

/** 규칙서 처리 상태 */
export type RulebookStatus = 'uploading' | 'processing' | 'ready' | 'error';

/** 규칙서 청크 콘텐츠 유형 */
export type ChunkContentType = 'rule' | 'table' | 'stat_block' | 'flavor';

/** 규칙서 청크 카테고리 */
export type ChunkCategory =
  | 'COMBAT'
  | 'MAGIC'
  | 'SKILLS'
  | 'ITEMS'
  | 'MONSTERS'
  | 'CHARACTER_CREATION'
  | 'GENERAL';

/** 규칙서 */
export interface Rulebook {
  id: RulebookId;
  userId: UserId;
  name: string;
  system: RulebookSystem;
  fileUrl: string;
  status: RulebookStatus;
  pageCount: number;
  createdAt: string;
}

/** 규칙서 청크 (벡터 검색용) */
export interface RulebookChunk {
  id: string;
  rulebookId: RulebookId;
  content: string;
  page: number;
  chapter: string;
  section: string;
  contentType: ChunkContentType;
  category: ChunkCategory;
  embedding: number[];
  metadata: Record<string, unknown>;
}

// ─── 전투 ───────────────────────────────────────────────

/** 전투 참가자 이니셔티브 */
export interface CombatantInit {
  characterId: CharacterId;
  name: string;
  initiative: number;
  isNPC: boolean;
}

/** 전투 상태 */
export interface CombatState {
  isActive: boolean;
  round: number;
  currentTurnIndex: number;
  initiativeOrder: CombatantInit[];
  conditions: Record<string, string[]>;
}
