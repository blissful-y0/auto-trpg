// Redis 서비스 내부 타입 정의

// 세션 상태 (JSON 직렬화)
export interface SessionState {
  sessionId: string;
  status: 'waiting' | 'active' | 'paused' | 'completed';
  gameSystem: string;
  currentScene: number;
  worldState: {
    currentLocation?: string;
    timeOfDay?: string;
    weather?: string;
    activeNPCs?: string[];
    [key: string]: unknown;
  };
  settings: Record<string, unknown>;
  updatedAt: string;
}

// 캐릭터 상태 (Redis Hash 필드)
export interface CharacterState {
  characterId: string;
  name: string;
  race: string;
  class: string;
  level: number;
  hpCurrent: number;
  hpMax: number;
  hpTemp: number;
  armorClass: number;
  inventory: string; // JSON 문자열
  abilities: string; // JSON 문자열
  conditions: string; // JSON 문자열 배열
  status: 'active' | 'dead' | 'retired' | 'unconscious';
}

// 전투 상태
export interface CombatState {
  isActive: boolean;
  round: number;
  currentTurnIndex: number;
  combatants: CombatantState[];
  startedAt: string;
}

// 전투 참가자
export interface CombatantState {
  id: string;
  name: string;
  initiative: number;
  hpCurrent: number;
  hpMax: number;
  armorClass: number;
  isPlayer: boolean;
  conditions: string[];
}

// 채팅 메시지 (Redis List 항목)
export interface RedisMessage {
  id: string;
  sessionId: string;
  senderId?: string;
  senderType: 'player' | 'gm' | 'system';
  content: string;
  metadata?: Record<string, unknown>;
  isOOC: boolean;
  createdAt: string;
}

// 영속화 상태 추적
export interface DirtyState {
  sessionState: boolean;
  characters: Set<string>; // dirty 캐릭터 ID 목록
  combat: boolean;
  messages: boolean;
}

// Redis 키 패턴
export const REDIS_KEYS = {
  // 세션 상태
  sessionState: (sessionId: string) => `trpg:session:${sessionId}:state`,
  // 전투 상태
  sessionCombat: (sessionId: string) => `trpg:session:${sessionId}:combat`,
  // 캐릭터 해시 (HSET/HGET/HGETALL)
  sessionCharacters: (sessionId: string) => `trpg:session:${sessionId}:characters`,
  // 메시지 리스트 (RPUSH/LRANGE)
  sessionMessages: (sessionId: string) => `trpg:session:${sessionId}:messages`,
  // 액션 큐 (향후 확장용)
  sessionQueue: (sessionId: string) => `trpg:session:${sessionId}:queue`,
  // Pub/Sub 이벤트 채널
  eventChannel: (sessionId: string) => `trpg:events:${sessionId}`,
  // 활성 세션 목록 (SET)
  activeSessions: 'trpg:active_sessions',
} as const;

// 기본 TTL (초)
export const DEFAULT_TTL = 4 * 60 * 60; // 4시간

// 최대 메시지 보관 수
export const MAX_MESSAGES = 500;

// 영속화 주기 (밀리초)
export const PERSIST_INTERVAL = 5 * 60 * 1000; // 5분
