// Socket.io 서버 생성 및 인증 미들웨어

import { Server } from 'socket.io';
import type { Server as HTTPServer } from 'http';
import { supabaseAdmin } from '../lib/supabase';
import { config } from '../config';
import { RoomManager } from './RoomManager';
import { ActionQueue } from './ActionQueue';
import { SocketThrottle } from './SocketThrottle';
import { registerHandlers } from './EventHandlers';
import type { ClientEvents, ServerEvents, SocketData } from './types';
import type { SaveManager } from '../services/redis/SaveManager';
import type { PersistenceManager } from '../services/redis/PersistenceManager';

// 공유 인스턴스
const roomManager = new RoomManager();
const actionQueue = new ActionQueue();
const socketThrottle = new SocketThrottle();

export type TypedSocketServer = Server<ClientEvents, ServerEvents, Record<string, never>, SocketData>;

// 외부에서 주입되는 서비스 인스턴스
let _saveManager: SaveManager | undefined;
let _persistenceManager: PersistenceManager | undefined;

export function setSocketServices(sm: SaveManager, pm: PersistenceManager): void {
  _saveManager = sm;
  _persistenceManager = pm;
}

// Socket.io 서버 생성
export function createSocketServer(httpServer: HTTPServer): TypedSocketServer {
  const io = new Server<ClientEvents, ServerEvents, Record<string, never>, SocketData>(httpServer, {
    cors: {
      origin: config.cors.origin,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  // Supabase JWT 인증 미들웨어
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token as string | undefined;

      if (!token) {
        return next(new Error('인증 토큰이 필요합니다.'));
      }

      // Supabase로 JWT 검증
      const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

      if (error || !user) {
        return next(new Error('유효하지 않은 인증 토큰입니다.'));
      }

      // 소켓에 사용자 정보 저장
      socket.data.user = {
        userId: user.id,
        email: user.email,
        role: user.role,
      };

      next();
    } catch (err) {
      next(new Error('인증 처리 중 오류가 발생했습니다.'));
    }
  });

  // 연결 이벤트
  io.on('connection', (socket) => {
    console.log(`소켓 연결: ${socket.id} (사용자: ${socket.data.user.userId})`);

    // 이벤트 핸들러 등록
    registerHandlers(io, socket, roomManager, actionQueue, _saveManager, _persistenceManager, socketThrottle);

    socket.on('disconnect', (reason) => {
      console.log(`소켓 연결 종료: ${socket.id} (이유: ${reason})`);
    });
  });

  return io;
}

// RoomManager / ActionQueue 인스턴스 접근용
export { roomManager, actionQueue };
