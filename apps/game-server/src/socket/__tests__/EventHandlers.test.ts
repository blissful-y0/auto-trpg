import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RoomManager } from '../RoomManager';
import { ActionQueue } from '../ActionQueue';
import { registerHandlers } from '../EventHandlers';

// bootstrap 모듈 모킹 — GameEngine 생성 시 DB 접근 차단
vi.mock('../../bootstrap', () => ({
  createGameEngineForSession: vi.fn().mockResolvedValue({
    processAction: vi.fn().mockResolvedValue({
      narrative: '[테스트] GM 응답입니다.',
      stateChanges: [],
    }),
  }),
}));

// 테이블별 응답을 구성하는 supabaseAdmin 모킹
function createChainMock(singleResult: { data: unknown; error: unknown }) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(singleResult),
    insert: vi.fn().mockReturnValue({
      then: vi.fn((cb: (v: unknown) => void) => {
        cb({ error: null });
        return { catch: vi.fn() };
      }),
    }),
  };
  return chain;
}

const tableResponses: Record<string, { data: unknown; error: unknown }> = {
  session_participants: { data: { id: 'sp-1' }, error: null },
  game_sessions: {
    data: {
      id: 'session-1',
      name: '테스트 세션',
      game_system: 'dnd5e',
      world_state: {},
      created_by: 'user-test-1',
    },
    error: null,
  },
  characters: { data: [], error: null },
  messages: { data: null, error: null },
};

vi.mock('../../lib/supabase', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) =>
      createChainMock(tableResponses[table] ?? { data: null, error: null }),
    ),
  },
}));

function createMockSocket(
  userOverrides?: Partial<{ userId: string; email: string; role: string }>,
) {
  const handlers: Record<string, (...args: unknown[]) => void> = {};

  const socket = {
    id: 'socket-test-1',
    data: {
      user: {
        userId: 'user-test-1',
        email: 'test@test.com',
        role: 'authenticated',
        ...userOverrides,
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
    tableResponses.session_participants = { data: { id: 'sp-1' }, error: null };
    tableResponses.game_sessions = {
      data: {
        id: 'session-1',
        name: '테스트 세션',
        game_system: 'dnd5e',
        world_state: {},
        created_by: 'user-test-1',
      },
      error: null,
    };
  });

  it('player:join 이벤트를 처리하고 player:joined를 브로드캐스트해야 한다', async () => {
    const { socket, handlers } = createMockSocket();
    const io = createMockIO();

    registerHandlers(io as any, socket as any, roomManager, actionQueue);

    handlers['player:join']({ sessionId: 'session-1', characterId: 'char-1' });
    await new Promise((r) => setTimeout(r, 10));

    expect(socket.join).toHaveBeenCalledWith('session-1');
    expect(io.to).toHaveBeenCalledWith('session-1');
    expect(io._emit).toHaveBeenCalledWith('player:joined', {
      sessionId: 'session-1',
      userId: 'user-test-1',
      characterId: 'char-1',
      name: 'test@test.com',
    });
    expect(roomManager.isPlayerInRoom('user-test-1', 'session-1')).toBe(true);
  });

  it('비멤버가 player:join 시 FORBIDDEN 에러를 보내야 한다', async () => {
    tableResponses.session_participants = {
      data: null,
      error: { message: 'not found', code: 'PGRST116' },
    };

    const { socket, handlers } = createMockSocket();
    const io = createMockIO();

    registerHandlers(io as any, socket as any, roomManager, actionQueue);

    handlers['player:join']({ sessionId: 'session-1', characterId: 'char-1' });
    await new Promise((r) => setTimeout(r, 10));

    expect(socket.emit).toHaveBeenCalledWith('error', {
      code: 'FORBIDDEN',
      message: '이 세션에 참가할 권한이 없습니다.',
    });
    expect(socket.join).not.toHaveBeenCalled();
    expect(roomManager.isPlayerInRoom('user-test-1', 'session-1')).toBe(false);
  });

  it('player:leave 이벤트를 처리하고 player:left를 브로드캐스트해야 한다', async () => {
    const { socket, handlers } = createMockSocket();
    const io = createMockIO();

    registerHandlers(io as any, socket as any, roomManager, actionQueue);

    handlers['player:join']({ sessionId: 'session-1', characterId: 'char-1' });
    await new Promise((r) => setTimeout(r, 10));
    vi.clearAllMocks();

    handlers['player:leave']({ sessionId: 'session-1' });

    expect(socket.leave).toHaveBeenCalledWith('session-1');
    expect(io.to).toHaveBeenCalledWith('session-1');
    expect(io._emit).toHaveBeenCalledWith('player:left', {
      sessionId: 'session-1',
      userId: 'user-test-1',
      name: 'test@test.com',
    });
  });

  it('player:action — 룸에 있는 멤버의 액션을 처리하고 gm:response를 브로드캐스트해야 한다', async () => {
    const { socket, handlers } = createMockSocket();
    const io = createMockIO();

    registerHandlers(io as any, socket as any, roomManager, actionQueue);

    // 먼저 룸에 참가 (roomManager fast-path 활성화)
    handlers['player:join']({ sessionId: 'session-1', characterId: 'char-1' });
    await new Promise((r) => setTimeout(r, 10));
    vi.clearAllMocks();

    handlers['player:action']({
      sessionId: 'session-1',
      characterId: 'char-1',
      action: 'message',
      message: '주변을 살펴봅니다.',
    });

    await new Promise((r) => setTimeout(r, 50));

    expect(io.to).toHaveBeenCalledWith('session-1');
    expect(io._emit).toHaveBeenCalledWith(
      'gm:response',
      expect.objectContaining({
        sessionId: 'session-1',
        response: expect.objectContaining({
          narrative: '[테스트] GM 응답입니다.',
        }),
      }),
    );
  });

  it('비멤버의 player:action은 FORBIDDEN 에러를 보내야 한다', async () => {
    tableResponses.session_participants = {
      data: null,
      error: { message: 'not found', code: 'PGRST116' },
    };

    const { socket, handlers } = createMockSocket();
    const io = createMockIO();

    registerHandlers(io as any, socket as any, roomManager, actionQueue);

    handlers['player:action']({
      sessionId: 'session-1',
      characterId: 'char-1',
      action: 'message',
      message: '주변을 살펴봅니다.',
    });

    await new Promise((r) => setTimeout(r, 50));

    expect(socket.emit).toHaveBeenCalledWith('error', {
      code: 'FORBIDDEN',
      message: '이 세션에서 액션을 수행할 권한이 없습니다.',
    });
    expect(io._emit).not.toHaveBeenCalled();
  });

  it('dice:roll 이벤트를 처리하고 dice:result를 브로드캐스트해야 한다', async () => {
    const { socket, handlers } = createMockSocket();
    const io = createMockIO();

    registerHandlers(io as any, socket as any, roomManager, actionQueue);

    // 룸에 참가시켜 fast-path 활성화
    handlers['player:join']({ sessionId: 'session-1', characterId: 'char-1' });
    await new Promise((r) => setTimeout(r, 10));
    vi.clearAllMocks();

    handlers['dice:roll']({
      sessionId: 'session-1',
      dice: 'd20',
      count: 1,
      modifier: 3,
      reason: '감지 체크',
    });
    await new Promise((r) => setTimeout(r, 10));

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

    const resultPayload = io._emit.mock.calls[0][1];
    expect(resultPayload.rolls).toHaveLength(1);
    expect(resultPayload.rolls[0]).toBeGreaterThanOrEqual(1);
    expect(resultPayload.rolls[0]).toBeLessThanOrEqual(20);
    expect(resultPayload.total).toBe(resultPayload.rolls[0] + 3);
  });

  it('비멤버의 dice:roll은 FORBIDDEN 에러를 보내야 한다', async () => {
    tableResponses.session_participants = {
      data: null,
      error: { message: 'not found', code: 'PGRST116' },
    };

    const { socket, handlers } = createMockSocket();
    const io = createMockIO();

    registerHandlers(io as any, socket as any, roomManager, actionQueue);

    handlers['dice:roll']({
      sessionId: 'session-1',
      dice: 'd20',
      count: 1,
      modifier: 0,
      reason: '테스트',
    });
    await new Promise((r) => setTimeout(r, 10));

    expect(socket.emit).toHaveBeenCalledWith('error', {
      code: 'FORBIDDEN',
      message: '이 세션에서 주사위를 굴릴 권한이 없습니다.',
    });
    expect(io._emit).not.toHaveBeenCalled();
  });

  it('game:start — 세션 생성자만 게임을 시작할 수 있어야 한다', async () => {
    const { socket, handlers } = createMockSocket();
    const io = createMockIO();

    registerHandlers(io as any, socket as any, roomManager, actionQueue);

    handlers['game:start']({ sessionId: 'session-1' });
    await new Promise((r) => setTimeout(r, 10));

    expect(io.to).toHaveBeenCalledWith('session-1');
    expect(io._emit).toHaveBeenCalledWith('game:stateUpdate', {
      sessionId: 'session-1',
      changes: [{ type: 'gameStarted' }],
    });
  });

  it('game:start — 비생성자는 FORBIDDEN 에러를 받아야 한다', async () => {
    tableResponses.game_sessions = {
      data: { id: 'session-1', created_by: 'other-user-id' },
      error: null,
    };

    const { socket, handlers } = createMockSocket();
    const io = createMockIO();

    registerHandlers(io as any, socket as any, roomManager, actionQueue);

    handlers['game:start']({ sessionId: 'session-1' });
    await new Promise((r) => setTimeout(r, 10));

    expect(socket.emit).toHaveBeenCalledWith('error', {
      code: 'FORBIDDEN',
      message: '게임을 시작할 권한이 없습니다. 세션 생성자만 시작할 수 있습니다.',
    });
    expect(io._emit).not.toHaveBeenCalled();
  });

  it('방이 가득 찼을 때 error 이벤트를 보내야 한다', async () => {
    const { socket, handlers } = createMockSocket();
    const io = createMockIO();

    registerHandlers(io as any, socket as any, roomManager, actionQueue);

    roomManager.joinRoom('other-socket', 'session-1', 'other-user');
    roomManager.setMaxPlayers('session-1', 1);

    handlers['player:join']({ sessionId: 'session-1', characterId: 'char-1' });
    await new Promise((r) => setTimeout(r, 10));

    expect(socket.emit).toHaveBeenCalledWith('error', {
      code: 'ROOM_FULL',
      message: '방이 가득 찼습니다.',
    });
  });

  it('disconnect 시 모든 방에서 퇴장하고 player:left를 브로드캐스트해야 한다', async () => {
    const { socket, handlers } = createMockSocket();
    const io = createMockIO();

    registerHandlers(io as any, socket as any, roomManager, actionQueue);

    handlers['player:join']({ sessionId: 'session-1', characterId: 'char-1' });
    handlers['player:join']({ sessionId: 'session-2', characterId: 'char-2' });
    await new Promise((r) => setTimeout(r, 20));
    vi.clearAllMocks();

    handlers['disconnect']();

    expect(io.to).toHaveBeenCalledWith('session-1');
    expect(io.to).toHaveBeenCalledWith('session-2');
    expect(io._emit).toHaveBeenCalledTimes(2);
  });
});
