import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RoomManager } from '../RoomManager';
import { ActionQueue } from '../ActionQueue';
import { registerHandlers } from '../EventHandlers';

// Socket.io 목(mock) 생성 헬퍼
function createMockSocket() {
  const handlers: Record<string, (...args: unknown[]) => void> = {};

  const socket = {
    id: 'socket-test-1',
    data: {
      user: {
        userId: 'user-test-1',
        email: 'test@test.com',
        role: 'authenticated',
      },
    },
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      handlers[event] = handler;
    }),
    emit: vi.fn(),
    join: vi.fn(),
    leave: vi.fn(),
  };

  return { socket, handlers };
}

function createMockIO() {
  const emitFn = vi.fn();

  return {
    to: vi.fn(() => ({
      emit: emitFn,
    })),
    _emit: emitFn,
  };
}

describe('EventHandlers', () => {
  let roomManager: RoomManager;
  let actionQueue: ActionQueue;

  beforeEach(() => {
    roomManager = new RoomManager();
    actionQueue = new ActionQueue();
  });

  it('player:join 이벤트를 처리하고 player:joined를 브로드캐스트해야 한다', () => {
    const { socket, handlers } = createMockSocket();
    const io = createMockIO();

    registerHandlers(io as any, socket as any, roomManager, actionQueue);

    // player:join 이벤트 발생
    handlers['player:join']({ sessionId: 'session-1', characterId: 'char-1' });

    // Socket.io 룸에 참가
    expect(socket.join).toHaveBeenCalledWith('session-1');

    // player:joined 브로드캐스트
    expect(io.to).toHaveBeenCalledWith('session-1');
    expect(io._emit).toHaveBeenCalledWith('player:joined', {
      sessionId: 'session-1',
      userId: 'user-test-1',
      characterId: 'char-1',
      name: 'test@test.com',
    });

    // RoomManager에 등록 확인
    expect(roomManager.isPlayerInRoom('user-test-1', 'session-1')).toBe(true);
  });

  it('player:leave 이벤트를 처리하고 player:left를 브로드캐스트해야 한다', () => {
    const { socket, handlers } = createMockSocket();
    const io = createMockIO();

    registerHandlers(io as any, socket as any, roomManager, actionQueue);

    // 먼저 참가
    handlers['player:join']({ sessionId: 'session-1', characterId: 'char-1' });
    vi.clearAllMocks();

    // 퇴장
    handlers['player:leave']({ sessionId: 'session-1' });

    // Socket.io 룸에서 퇴장
    expect(socket.leave).toHaveBeenCalledWith('session-1');

    // player:left 브로드캐스트
    expect(io.to).toHaveBeenCalledWith('session-1');
    expect(io._emit).toHaveBeenCalledWith('player:left', {
      sessionId: 'session-1',
      userId: 'user-test-1',
      name: 'test@test.com',
    });
  });

  it('player:action 이벤트를 처리하고 gm:response를 브로드캐스트해야 한다', async () => {
    const { socket, handlers } = createMockSocket();
    const io = createMockIO();

    registerHandlers(io as any, socket as any, roomManager, actionQueue);

    // 액션 전송
    handlers['player:action']({
      sessionId: 'session-1',
      characterId: 'char-1',
      action: 'message',
      message: '주변을 살펴봅니다.',
    });

    // ActionQueue가 비동기이므로 대기
    await new Promise((r) => setTimeout(r, 50));

    // gm:response 브로드캐스트 (에코 응답)
    expect(io.to).toHaveBeenCalledWith('session-1');
    expect(io._emit).toHaveBeenCalledWith(
      'gm:response',
      expect.objectContaining({
        sessionId: 'session-1',
        response: expect.objectContaining({
          narrative: '[에코] 주변을 살펴봅니다.',
        }),
      }),
    );
  });

  it('dice:roll 이벤트를 처리하고 dice:result를 브로드캐스트해야 한다', () => {
    const { socket, handlers } = createMockSocket();
    const io = createMockIO();

    registerHandlers(io as any, socket as any, roomManager, actionQueue);

    handlers['dice:roll']({
      sessionId: 'session-1',
      dice: 'd20',
      count: 1,
      modifier: 3,
      reason: '감지 체크',
    });

    expect(io.to).toHaveBeenCalledWith('session-1');
    expect(io._emit).toHaveBeenCalledWith(
      'dice:result',
      expect.objectContaining({
        sessionId: 'session-1',
        userId: 'user-test-1',
        dice: 'd20',
        count: 1,
        modifier: 3,
        reason: '감지 체크',
      }),
    );

    // 결과값 검증 (1~23 범위)
    const resultPayload = io._emit.mock.calls[0][1];
    expect(resultPayload.rolls).toHaveLength(1);
    expect(resultPayload.rolls[0]).toBeGreaterThanOrEqual(1);
    expect(resultPayload.rolls[0]).toBeLessThanOrEqual(20);
    expect(resultPayload.total).toBe(resultPayload.rolls[0] + 3);
  });

  it('방이 가득 찼을 때 error 이벤트를 보내야 한다', () => {
    const { socket, handlers } = createMockSocket();
    const io = createMockIO();

    registerHandlers(io as any, socket as any, roomManager, actionQueue);

    // 방 생성 및 최대 인원 1로 설정
    roomManager.joinRoom('other-socket', 'session-1', 'other-user');
    roomManager.setMaxPlayers('session-1', 1);

    // 가득 찬 방에 참가 시도
    handlers['player:join']({ sessionId: 'session-1', characterId: 'char-1' });

    expect(socket.emit).toHaveBeenCalledWith('error', {
      code: 'ROOM_FULL',
      message: '방이 가득 찼습니다.',
    });
  });

  it('disconnect 시 모든 방에서 퇴장하고 player:left를 브로드캐스트해야 한다', () => {
    const { socket, handlers } = createMockSocket();
    const io = createMockIO();

    registerHandlers(io as any, socket as any, roomManager, actionQueue);

    // 두 세션에 참가
    handlers['player:join']({ sessionId: 'session-1', characterId: 'char-1' });
    handlers['player:join']({ sessionId: 'session-2', characterId: 'char-2' });
    vi.clearAllMocks();

    // disconnect 발생
    handlers['disconnect']();

    // 두 방 모두에서 player:left 브로드캐스트
    expect(io.to).toHaveBeenCalledWith('session-1');
    expect(io.to).toHaveBeenCalledWith('session-2');
    expect(io._emit).toHaveBeenCalledTimes(2);
  });
});
