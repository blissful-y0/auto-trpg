// Socket.io 이벤트 핸들러 — 클라이언트 이벤트 처리 및 브로드캐스트

import type { Server, Socket } from 'socket.io';
import type {
  ClientEvents,
  ServerEvents,
  SocketData,
  PlayerJoinPayload,
  PlayerLeavePayload,
  PlayerActionPayload,
  DiceRollPayload,
  ChatMessagePayload,
  GameStartPayload,
  CombatActionPayload,
} from './types';
import type { RoomManager } from './RoomManager';
import type { ActionQueue } from './ActionQueue';

type TypedServer = Server<ClientEvents, ServerEvents, Record<string, never>, SocketData>;
type TypedSocket = Socket<ClientEvents, ServerEvents, Record<string, never>, SocketData>;

// 주사위 굴림 헬퍼
function rollDice(sides: number): number {
  return Math.floor(Math.random() * sides) + 1;
}

// 주사위 문자열 파싱 (예: "d20" → 20)
function parseDiceSides(dice: string): number {
  const match = dice.match(/d(\d+)/i);
  return match ? parseInt(match[1], 10) : 20;
}

// 이벤트 핸들러 등록
export function registerHandlers(
  io: TypedServer,
  socket: TypedSocket,
  roomManager: RoomManager,
  actionQueue: ActionQueue,
): void {
  const user = socket.data.user;

  // player:join — 세션 참가
  socket.on('player:join', (payload: PlayerJoinPayload) => {
    try {
      const { sessionId, characterId } = payload;
      const result = roomManager.joinRoom(socket.id, sessionId, user.userId, characterId);

      if (!result.success) {
        socket.emit('error', { code: 'ROOM_FULL', message: result.error ?? '참가에 실패했습니다.' });
        return;
      }

      // Socket.io 룸 참가
      socket.join(sessionId);

      // 참가 알림 브로드캐스트 (본인 포함)
      io.to(sessionId).emit('player:joined', {
        sessionId,
        userId: user.userId,
        characterId: characterId ?? '',
        name: user.email ?? '알 수 없는 플레이어',
      });
    } catch (err) {
      socket.emit('error', {
        code: 'JOIN_ERROR',
        message: err instanceof Error ? err.message : '참가 중 오류가 발생했습니다.',
      });
    }
  });

  // player:leave — 세션 퇴장
  socket.on('player:leave', (payload: PlayerLeavePayload) => {
    try {
      const { sessionId } = payload;
      roomManager.leaveRoom(socket.id, sessionId);
      socket.leave(sessionId);

      // 퇴장 알림 브로드캐스트
      io.to(sessionId).emit('player:left', {
        sessionId,
        userId: user.userId,
        name: user.email ?? '알 수 없는 플레이어',
      });
    } catch (err) {
      socket.emit('error', {
        code: 'LEAVE_ERROR',
        message: err instanceof Error ? err.message : '퇴장 중 오류가 발생했습니다.',
      });
    }
  });

  // player:action — 플레이어 액션 (순차 큐 처리)
  socket.on('player:action', (payload: PlayerActionPayload) => {
    const { sessionId } = payload;

    actionQueue
      .enqueue(sessionId, async () => {
        // TODO: GameEngine 연동 시 여기서 실제 처리
        // 현재는 에코 응답
        return {
          narrative: `[에코] ${payload.message}`,
          stateChanges: [],
        };
      })
      .then((result) => {
        const response = result as { narrative: string; stateChanges: unknown[] };
        io.to(sessionId).emit('gm:response', {
          sessionId,
          response: {
            narrative: response.narrative,
            stateChanges: response.stateChanges,
          },
          timestamp: new Date().toISOString(),
        });
      })
      .catch((err) => {
        socket.emit('error', {
          code: 'ACTION_ERROR',
          message: err instanceof Error ? err.message : '액션 처리 중 오류가 발생했습니다.',
        });
      });
  });

  // dice:roll — 주사위 굴림
  socket.on('dice:roll', (payload: DiceRollPayload) => {
    try {
      const { sessionId, dice, count, modifier, reason } = payload;
      const sides = parseDiceSides(dice);
      const rollCount = Math.min(Math.max(count, 1), 100); // 1~100개 제한

      const rolls: number[] = [];
      for (let i = 0; i < rollCount; i++) {
        rolls.push(rollDice(sides));
      }

      const total = rolls.reduce((sum, r) => sum + r, 0) + modifier;

      // 결과 브로드캐스트
      io.to(sessionId).emit('dice:result', {
        sessionId,
        userId: user.userId,
        dice,
        count: rollCount,
        modifier,
        rolls,
        total,
        reason,
      });
    } catch (err) {
      socket.emit('error', {
        code: 'DICE_ERROR',
        message: err instanceof Error ? err.message : '주사위 굴림 중 오류가 발생했습니다.',
      });
    }
  });

  // chat:message — 채팅 메시지 중계
  socket.on('chat:message', (payload: ChatMessagePayload) => {
    try {
      const { sessionId, content, isOOC } = payload;

      // 채팅은 player:action과 동일한 이벤트로 중계 (OOC 여부 포함)
      io.to(sessionId).emit('gm:response', {
        sessionId,
        response: {
          narrative: content,
          stateChanges: [],
        },
        timestamp: new Date().toISOString(),
      });

      // OOC가 아닌 일반 메시지는 액션 큐에도 전달하지 않음 (채팅은 즉시 전달)
      void isOOC; // isOOC 활용은 향후 확장
    } catch (err) {
      socket.emit('error', {
        code: 'CHAT_ERROR',
        message: err instanceof Error ? err.message : '채팅 전송 중 오류가 발생했습니다.',
      });
    }
  });

  // game:start — 게임 시작
  socket.on('game:start', (payload: GameStartPayload) => {
    try {
      const { sessionId } = payload;

      // 게임 상태 업데이트 브로드캐스트
      io.to(sessionId).emit('game:stateUpdate', {
        sessionId,
        changes: [{ type: 'gameStarted' }],
      });
    } catch (err) {
      socket.emit('error', {
        code: 'START_ERROR',
        message: err instanceof Error ? err.message : '게임 시작 중 오류가 발생했습니다.',
      });
    }
  });

  // combat:action — 전투 액션 (스텁)
  socket.on('combat:action', (payload: CombatActionPayload) => {
    try {
      const { sessionId } = payload;

      // TODO: 전투 시스템 고도화 (Phase 2.5) 시 구현
      io.to(sessionId).emit('combat:update', {
        sessionId,
        combatState: {
          message: `전투 액션 수신: ${payload.action}`,
          status: 'pending',
        },
      });
    } catch (err) {
      socket.emit('error', {
        code: 'COMBAT_ERROR',
        message: err instanceof Error ? err.message : '전투 액션 처리 중 오류가 발생했습니다.',
      });
    }
  });

  // 연결 종료 시 모든 방에서 퇴장
  socket.on('disconnect', () => {
    const leftRooms = roomManager.leaveAllRooms(socket.id);
    for (const { sessionId, userId } of leftRooms) {
      io.to(sessionId).emit('player:left', {
        sessionId,
        userId,
        name: user.email ?? '알 수 없는 플레이어',
      });
    }
  });
}
