// Socket.io 서버 내부 타입 정의

// 인증된 소켓 사용자 데이터
export interface SocketUserData {
  userId: string;
  email?: string;
  role?: string;
}

// 방 참가자 정보
export interface RoomPlayer {
  userId: string;
  characterId?: string;
  socketId: string;
}

// 방 정보
export interface RoomInfo {
  sessionId: string;
  players: Map<string, RoomPlayer>;
  maxPlayers: number;
  createdAt: Date;
}

// 액션 큐 아이템
export interface QueueItem {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  handler: () => Promise<unknown>;
}

// 클라이언트 → 서버 이벤트 페이로드
export interface PlayerActionPayload {
  sessionId: string;
  characterId: string;
  action: string;
  message: string;
}

export interface PlayerJoinPayload {
  sessionId: string;
  characterId: string;
}

export interface PlayerLeavePayload {
  sessionId: string;
}

export interface DiceRollPayload {
  sessionId: string;
  dice: string;
  count: number;
  modifier: number;
  reason: string;
}

export interface ChatMessagePayload {
  sessionId: string;
  content: string;
  isOOC: boolean;
}

export interface GameStartPayload {
  sessionId: string;
}

export interface CombatActionPayload {
  sessionId: string;
  characterId: string;
  action: string;
  targetId?: string;
}

// ─── 세이브/로드 이벤트 페이로드 ────────────────────────

export interface SessionSavePayload {
  sessionId: string;
  name?: string;
}

export interface SessionLoadPayload {
  sessionId: string;
  savePointId: string;
}

export interface SessionPausePayload {
  sessionId: string;
}

export interface SessionResumePayload {
  sessionId: string;
}

export interface SessionCostReportPayload {
  sessionId: string;
}

// 클라이언트 이벤트 맵
export interface ClientEvents {
  'player:action': (payload: PlayerActionPayload) => void;
  'player:join': (payload: PlayerJoinPayload) => void;
  'player:leave': (payload: PlayerLeavePayload) => void;
  'dice:roll': (payload: DiceRollPayload) => void;
  'chat:message': (payload: ChatMessagePayload) => void;
  'game:start': (payload: GameStartPayload) => void;
  'combat:action': (payload: CombatActionPayload) => void;
  'session:save': (payload: SessionSavePayload) => void;
  'session:load': (payload: SessionLoadPayload) => void;
  'session:pause': (payload: SessionPausePayload) => void;
  'session:resume': (payload: SessionResumePayload) => void;
  'session:costReport': (payload: SessionCostReportPayload) => void;
}

// 서버 → 클라이언트 이벤트 페이로드
export interface GMResponsePayload {
  sessionId: string;
  response: {
    narrative: string;
    stateChanges?: unknown[];
    diceRequests?: Array<{ notation: string; purpose: string; dc?: number }>;
  };
  timestamp: string;
}

export interface GMStreamPayload {
  sessionId: string;
  chunk: string;
  done: boolean;
}

export interface PlayerJoinedPayload {
  sessionId: string;
  userId: string;
  characterId: string;
  name: string;
}

export interface PlayerLeftPayload {
  sessionId: string;
  userId: string;
  name: string;
}

export interface DiceResultPayload {
  sessionId: string;
  userId: string;
  dice: string;
  count: number;
  modifier: number;
  rolls: number[];
  total: number;
  reason: string;
}

export interface CombatUpdatePayload {
  sessionId: string;
  combatState: unknown;
}

export interface StateUpdatePayload {
  sessionId: string;
  changes: unknown[];
  fullState?: Record<string, unknown>;
}

export interface ErrorPayload {
  code: string;
  message: string;
}

// ─── 세이브/로드 서버 이벤트 페이로드 ───────────────────

export interface SaveCompletePayload {
  sessionId: string;
  savePointId: string;
  saveType: 'manual' | 'auto' | 'pause';
  name: string;
  timestamp: string;
}

export interface LoadCompletePayload {
  sessionId: string;
  savePointId: string;
  snapshot: unknown;
}

export interface SessionPausedPayload {
  sessionId: string;
  savePointId: string;
  pausedBy: string;
  timestamp: string;
}

export interface SessionResumedPayload {
  sessionId: string;
  resumedBy: string;
  timestamp: string;
}

export interface AutoSaveIndicatorPayload {
  sessionId: string;
  status: 'saving' | 'saved' | 'error';
  timestamp: string;
}

// 서버 이벤트 맵
export interface ServerEvents {
  'gm:response': (payload: GMResponsePayload) => void;
  'gm:stream': (payload: GMStreamPayload) => void;
  'game:stateUpdate': (payload: StateUpdatePayload) => void;
  'player:joined': (payload: PlayerJoinedPayload) => void;
  'player:left': (payload: PlayerLeftPayload) => void;
  'dice:result': (payload: DiceResultPayload) => void;
  'combat:update': (payload: CombatUpdatePayload) => void;
  'session:saveComplete': (payload: SaveCompletePayload) => void;
  'session:loadComplete': (payload: LoadCompletePayload) => void;
  'session:paused': (payload: SessionPausedPayload) => void;
  'session:resumed': (payload: SessionResumedPayload) => void;
  'session:autoSaveIndicator': (payload: AutoSaveIndicatorPayload) => void;
  'session:costReportResult': (payload: SessionCostReportResultPayload) => void;
  'error': (payload: ErrorPayload) => void;
}

export interface SessionCostReportResultPayload {
  sessionId: string;
  totalCalls: number;
  totalTokens: number;
  estimatedCostUSD: number;
  estimatedCostKRW: number;
  byModel: Array<{
    model: string;
    provider: string;
    callCount: number;
    totalTokens: number;
    estimatedCostUSD: number;
  }>;
}

// 소켓 데이터 (socket.data에 저장)
export interface SocketData {
  user: SocketUserData;
}
