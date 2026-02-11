// WebSocket 이벤트 타입 정의

import type { GameSessionId, CharacterId, DiceType, DiceRoll, CombatState } from './game';
import type { GMResponse, StateChange } from './llm';

// ─── 클라이언트 → 서버 이벤트 ───────────────────────────

/** 클라이언트 이벤트 이름 */
export type ClientEventName =
  | 'player:action'
  | 'player:join'
  | 'player:leave'
  | 'dice:roll'
  | 'chat:message'
  | 'game:start'
  | 'combat:action';

/** 플레이어 행동 페이로드 */
export interface PlayerActionPayload {
  sessionId: GameSessionId;
  characterId: CharacterId;
  action: string;
  message: string;
}

/** 주사위 굴림 요청 페이로드 */
export interface DiceRollPayload {
  sessionId: GameSessionId;
  dice: DiceType;
  count: number;
  modifier: number;
  reason: string;
}

/** 채팅 메시지 페이로드 */
export interface ChatMessagePayload {
  sessionId: GameSessionId;
  content: string;
  isOOC: boolean;
}

/** 플레이어 참가 페이로드 */
export interface PlayerJoinPayload {
  sessionId: GameSessionId;
  characterId: CharacterId;
}

/** 플레이어 퇴장 페이로드 */
export interface PlayerLeavePayload {
  sessionId: GameSessionId;
}

/** 게임 시작 페이로드 */
export interface GameStartPayload {
  sessionId: GameSessionId;
}

/** 전투 행동 페이로드 */
export interface CombatActionPayload {
  sessionId: GameSessionId;
  characterId: CharacterId;
  action: string;
  targetId?: string;
}

/** 세이브 요청 페이로드 */
export interface SessionSavePayload {
  sessionId: GameSessionId;
  name?: string;
}

/** 로드 요청 페이로드 */
export interface SessionLoadPayload {
  sessionId: GameSessionId;
  savePointId: string;
}

/** 일시정지 요청 페이로드 */
export interface SessionPausePayload {
  sessionId: GameSessionId;
}

/** 재개 요청 페이로드 */
export interface SessionResumePayload {
  sessionId: GameSessionId;
}

/** 클라이언트 이벤트 맵 (이벤트명 → 페이로드 타입) */
export interface ClientEvents {
  'player:action': PlayerActionPayload;
  'player:join': PlayerJoinPayload;
  'player:leave': PlayerLeavePayload;
  'dice:roll': DiceRollPayload;
  'chat:message': ChatMessagePayload;
  'game:start': GameStartPayload;
  'combat:action': CombatActionPayload;
  'session:save': SessionSavePayload;
  'session:load': SessionLoadPayload;
  'session:pause': SessionPausePayload;
  'session:resume': SessionResumePayload;
}

// ─── 서버 → 클라이언트 이벤트 ───────────────────────────

/** 서버 이벤트 이름 */
export type ServerEventName =
  | 'gm:response'
  | 'gm:stream'
  | 'game:stateUpdate'
  | 'player:joined'
  | 'player:left'
  | 'dice:result'
  | 'combat:update'
  | 'error';

/** GM 응답 페이로드 */
export interface GMResponsePayload {
  sessionId: GameSessionId;
  response: GMResponse;
  timestamp: string;
}

/** GM 스트리밍 페이로드 */
export interface GMStreamPayload {
  sessionId: GameSessionId;
  chunk: string;
  done: boolean;
}

/** 상태 업데이트 페이로드 */
export interface StateUpdatePayload {
  sessionId: GameSessionId;
  changes: StateChange[];
  fullState?: Record<string, unknown>;
}

/** 전투 업데이트 페이로드 */
export interface CombatUpdatePayload {
  sessionId: GameSessionId;
  combatState: CombatState;
}

/** 플레이어 참가 알림 페이로드 */
export interface PlayerJoinedPayload {
  sessionId: GameSessionId;
  userId: string;
  characterId: CharacterId;
  name: string;
}

/** 플레이어 퇴장 알림 페이로드 */
export interface PlayerLeftPayload {
  sessionId: GameSessionId;
  userId: string;
  name: string;
}

/** 주사위 결과 페이로드 */
export interface DiceResultPayload {
  sessionId: GameSessionId;
  characterId: CharacterId;
  roll: DiceRoll;
}

/** 에러 페이로드 */
export interface ErrorPayload {
  code: string;
  message: string;
}

/** 세이브 완료 페이로드 */
export interface SaveCompletePayload {
  sessionId: GameSessionId;
  savePointId: string;
  saveType: 'manual' | 'auto' | 'pause';
  name: string;
  timestamp: string;
}

/** 로드 완료 페이로드 */
export interface LoadCompletePayload {
  sessionId: GameSessionId;
  savePointId: string;
  snapshot: unknown;
}

/** 일시정지 완료 페이로드 */
export interface SessionPausedPayload {
  sessionId: GameSessionId;
  savePointId: string;
  pausedBy: string;
  timestamp: string;
}

/** 재개 완료 페이로드 */
export interface SessionResumedPayload {
  sessionId: GameSessionId;
  resumedBy: string;
  timestamp: string;
}

/** 자동 세이브 인디케이터 페이로드 */
export interface AutoSaveIndicatorPayload {
  sessionId: GameSessionId;
  status: 'saving' | 'saved' | 'error';
  timestamp: string;
}

/** 서버 이벤트 맵 (이벤트명 → 페이로드 타입) */
export interface ServerEvents {
  'gm:response': GMResponsePayload;
  'gm:stream': GMStreamPayload;
  'game:stateUpdate': StateUpdatePayload;
  'player:joined': PlayerJoinedPayload;
  'player:left': PlayerLeftPayload;
  'dice:result': DiceResultPayload;
  'combat:update': CombatUpdatePayload;
  'session:saveComplete': SaveCompletePayload;
  'session:loadComplete': LoadCompletePayload;
  'session:paused': SessionPausedPayload;
  'session:resumed': SessionResumedPayload;
  'session:autoSaveIndicator': AutoSaveIndicatorPayload;
  'error': ErrorPayload;
}
