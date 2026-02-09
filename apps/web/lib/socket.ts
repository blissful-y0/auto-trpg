import { io, type Socket } from 'socket.io-client';

const SOCKET_URL =
  process.env.NEXT_PUBLIC_GAME_SERVER_URL ?? 'http://localhost:3001';

// 서버 → 클라이언트 이벤트 타입
interface ServerEvents {
  'gm:response': (payload: {
    sessionId: string;
    response: { narrative: string; stateChanges?: unknown[] };
    timestamp: string;
  }) => void;
  'gm:stream': (payload: {
    sessionId: string;
    chunk: string;
    done: boolean;
  }) => void;
  'game:stateUpdate': (payload: {
    sessionId: string;
    changes: unknown[];
    fullState?: Record<string, unknown>;
  }) => void;
  'player:joined': (payload: {
    sessionId: string;
    userId: string;
    characterId: string;
    name: string;
  }) => void;
  'player:left': (payload: {
    sessionId: string;
    userId: string;
    name: string;
  }) => void;
  'dice:result': (payload: {
    sessionId: string;
    userId: string;
    dice: string;
    count: number;
    modifier: number;
    rolls: number[];
    total: number;
    reason: string;
  }) => void;
  'combat:update': (payload: {
    sessionId: string;
    combatState: unknown;
  }) => void;
  'error': (payload: { code: string; message: string }) => void;
}

// 클라이언트 → 서버 이벤트 타입
interface ClientEvents {
  'player:action': (payload: {
    sessionId: string;
    characterId: string;
    action: string;
    message: string;
  }) => void;
  'player:join': (payload: {
    sessionId: string;
    characterId: string;
  }) => void;
  'player:leave': (payload: { sessionId: string }) => void;
  'dice:roll': (payload: {
    sessionId: string;
    dice: string;
    count: number;
    modifier: number;
    reason: string;
  }) => void;
  'chat:message': (payload: {
    sessionId: string;
    content: string;
    isOOC: boolean;
  }) => void;
  'game:start': (payload: { sessionId: string }) => void;
  'combat:action': (payload: {
    sessionId: string;
    characterId: string;
    action: string;
    targetId?: string;
  }) => void;
}

export type TypedSocket = Socket<ServerEvents, ClientEvents>;

let socket: TypedSocket | null = null;

// Socket.io 클라이언트 인스턴스 (싱글톤)
export function getSocket(): TypedSocket | null {
  return socket;
}

// 세션 연결
export function connectToSession(sessionId: string, token: string): TypedSocket {
  // 기존 연결이 있으면 종료
  if (socket) {
    socket.disconnect();
  }

  socket = io(SOCKET_URL, {
    autoConnect: false,
    transports: ['websocket', 'polling'],
    auth: { token },
  }) as TypedSocket;

  socket.connect();

  // 연결 후 세션 참가
  socket.on('connect', () => {
    socket?.emit('player:join', { sessionId, characterId: '' });
  });

  return socket;
}

// 연결 종료
export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
