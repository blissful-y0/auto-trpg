import { io, type Socket } from 'socket.io-client';

const SOCKET_URL =
  process.env.NEXT_PUBLIC_GAME_SERVER_URL ?? 'http://localhost:3001';

let socket: Socket | null = null;

// Socket.io 클라이언트 연결 (Phase 2 연동 기본 구조)
export function getSocket(): Socket {
  if (!socket) {
    socket = io(SOCKET_URL, {
      autoConnect: false,
      transports: ['websocket'],
    });
  }
  return socket;
}

export function connectToSession(sessionId: string, token: string) {
  const s = getSocket();

  s.auth = { token };
  s.connect();

  s.emit('join_session', { sessionId });

  return s;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

// 소켓 이벤트 타입
export interface SocketEvents {
  // 서버 → 클라이언트
  'gm_response_start': () => void;
  'gm_response_chunk': (data: { chunk: string }) => void;
  'gm_response_end': (data: { fullMessage: string }) => void;
  'dice_result': (data: {
    notation: string;
    rolls: number[];
    total: number;
    roller: string;
  }) => void;
  'player_joined': (data: { playerId: string; nickname: string }) => void;
  'player_left': (data: { playerId: string }) => void;
  'combat_update': (data: unknown) => void;

  // 클라이언트 → 서버
  'send_message': (data: { content: string; isOOC: boolean }) => void;
  'roll_dice': (data: { notation: string }) => void;
  'join_session': (data: { sessionId: string }) => void;
}
