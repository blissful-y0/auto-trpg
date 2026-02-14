import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// config/supabase 모듈을 먼저 mock하여 환경변수 의존성 제거
vi.mock('../../../config', () => ({
  config: {
    redis: { url: 'redis://localhost:6379' },
    supabase: { url: 'http://localhost', anonKey: 'test', serviceRoleKey: 'test' },
  },
}));
vi.mock('../../../lib/supabase', () => ({
  supabaseAdmin: {},
}));
vi.mock('../RedisClient', () => ({
  getRedisClient: vi.fn(),
}));

import { PersistenceManager } from '../PersistenceManager';
import { SessionStateStore } from '../SessionStateStore';
import type { SessionState, CharacterState } from '../types';

// SessionStateStore mock
function createMockStore() {
  const states: Map<string, SessionState> = new Map();
  const characters: Map<string, Map<string, CharacterState>> = new Map();
  const activeSessions: Set<string> = new Set();

  return {
    setSessionState: vi.fn(async (id: string, state: SessionState) => {
      states.set(id, state);
    }),
    getSessionState: vi.fn(async (id: string) => states.get(id) ?? null),
    setCharacter: vi.fn(async (sessionId: string, char: CharacterState) => {
      if (!characters.has(sessionId)) characters.set(sessionId, new Map());
      characters.get(sessionId)!.set(char.characterId, char);
    }),
    getCharacter: vi.fn(async (sessionId: string, charId: string) => {
      return characters.get(sessionId)?.get(charId) ?? null;
    }),
    getAllCharacters: vi.fn(async (sessionId: string) => {
      return Array.from(characters.get(sessionId)?.values() ?? []);
    }),
    registerActiveSession: vi.fn(async (id: string) => {
      activeSessions.add(id);
    }),
    unregisterActiveSession: vi.fn(async (id: string) => {
      activeSessions.delete(id);
    }),
    getActiveSessions: vi.fn(async () => Array.from(activeSessions)),
    clearSession: vi.fn(async (id: string) => {
      states.delete(id);
      characters.delete(id);
      activeSessions.delete(id);
    }),
    refreshTTL: vi.fn(),
    _states: states,
    _characters: characters,
    _activeSessions: activeSessions,
  };
}

// Supabase mock — .is() 체인 지원
function createMockSupabase() {
  return {
    from: vi.fn((table: string) => {
      if (table === 'characters') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                is: vi.fn(async () => ({
                  data: [
                    {
                      id: 'char-1',
                      name: '아라곤',
                      race: '인간',
                      class: '전사',
                      level: 5,
                      hit_points: { current: 40, max: 45, temp: 0 },
                      armor_class: 16,
                      inventory: ['장검'],
                      abilities: ['세컨드 윈드'],
                      status: 'active',
                    },
                  ],
                  error: null,
                })),
              })),
            })),
          })),
          update: vi.fn(() => ({
            eq: vi.fn(async () => ({ data: null, error: null })),
          })),
        };
      }
      // game_sessions 테이블
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            is: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: {
                  id: 'session-1',
                  status: 'active',
                  game_system: 'dnd5e',
                  current_scene: 1,
                  world_state: { currentLocation: '팬달린' },
                  settings: {},
                },
                error: null,
              })),
            })),
          })),
        })),
        update: vi.fn(() => ({
          eq: vi.fn(async () => ({ data: null, error: null })),
        })),
      };
    }),
  };
}

describe('PersistenceManager', () => {
  let mockStore: ReturnType<typeof createMockStore>;
  let mockSupabase: ReturnType<typeof createMockSupabase>;
  let manager: PersistenceManager;

  beforeEach(() => {
    vi.useFakeTimers();
    mockStore = createMockStore();
    mockSupabase = createMockSupabase();
    manager = new PersistenceManager(
      mockStore as unknown as SessionStateStore,
      mockSupabase as any,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ─── 세션 로드 테스트 ───────────────────────────────

  describe('loadSession', () => {
    it('Supabase에서 세션을 로드하여 Redis에 저장해야 한다', async () => {
      await manager.loadSession('session-1');

      // 세션 상태 저장 확인
      expect(mockStore.setSessionState).toHaveBeenCalledWith(
        'session-1',
        expect.objectContaining({
          sessionId: 'session-1',
          status: 'active',
          gameSystem: 'dnd5e',
        }),
      );

      // 캐릭터 저장 확인
      expect(mockStore.setCharacter).toHaveBeenCalled();

      // 활성 세션 등록 확인
      expect(mockStore.registerActiveSession).toHaveBeenCalledWith('session-1');
    });

    it('로드 후 dirty 상태가 false여야 한다', async () => {
      await manager.loadSession('session-1');
      expect(manager.isDirty('session-1')).toBe(false);
    });

    it('관리 세션 수가 증가해야 한다', async () => {
      expect(manager.activeSessionCount).toBe(0);
      await manager.loadSession('session-1');
      expect(manager.activeSessionCount).toBe(1);
    });
  });

  // ─── dirty 플래그 테스트 ────────────────────────────

  describe('dirty 플래그', () => {
    it('markDirty 후 isDirty가 true를 반환해야 한다', async () => {
      await manager.loadSession('session-1');
      expect(manager.isDirty('session-1')).toBe(false);

      manager.markDirty('session-1', 'sessionState');
      expect(manager.isDirty('session-1')).toBe(true);
    });

    it('markCharacterDirty 후 isDirty가 true를 반환해야 한다', async () => {
      await manager.loadSession('session-1');

      manager.markCharacterDirty('session-1', 'char-1');
      expect(manager.isDirty('session-1')).toBe(true);
    });
  });

  // ─── 영속화 테스트 ──────────────────────────────────

  describe('persistDelta', () => {
    it('dirty 상태가 아니면 Supabase에 쓰지 않아야 한다', async () => {
      await manager.loadSession('session-1');
      const initialCallCount = mockSupabase.from.mock.calls.length;

      await manager.persistDelta('session-1');

      // 추가 호출 없어야 함
      expect(mockSupabase.from.mock.calls.length).toBe(initialCallCount);
    });

    it('dirty 세션 상태를 Supabase에 영속화해야 한다', async () => {
      await manager.loadSession('session-1');
      manager.markDirty('session-1', 'sessionState');

      await manager.persistDelta('session-1');

      // Supabase update 호출 확인
      expect(mockSupabase.from).toHaveBeenCalledWith('game_sessions');
      expect(manager.isDirty('session-1')).toBe(false);
    });

    it('dirty 캐릭터를 Supabase에 영속화해야 한다', async () => {
      await manager.loadSession('session-1');
      manager.markCharacterDirty('session-1', 'char-1');

      // mock store에 캐릭터 데이터 설정
      mockStore._characters.set('session-1', new Map([
        ['char-1', {
          characterId: 'char-1',
          name: '아라곤',
          race: '인간',
          class: '전사',
          level: 5,
          hpCurrent: 35,
          hpMax: 45,
          hpTemp: 0,
          armorClass: 16,
          inventory: '["장검"]',
          abilities: '["세컨드 윈드"]',
          conditions: '[]',
          status: 'active' as const,
        }],
      ]));

      await manager.persistDelta('session-1');

      expect(mockSupabase.from).toHaveBeenCalledWith('characters');
      expect(manager.isDirty('session-1')).toBe(false);
    });
  });

  // ─── 세션 flush 테스트 ──────────────────────────────

  describe('flushSession', () => {
    it('모든 데이터를 영속화하고 Redis를 정리해야 한다', async () => {
      await manager.loadSession('session-1');
      manager.markDirty('session-1', 'sessionState');

      await manager.flushSession('session-1');

      // Redis 정리 확인
      expect(mockStore.clearSession).toHaveBeenCalledWith('session-1');
      expect(manager.activeSessionCount).toBe(0);
    });
  });

  // ─── 전체 종료 테스트 ───────────────────────────────

  describe('shutdownAll', () => {
    it('모든 활성 세션을 flush해야 한다', async () => {
      await manager.loadSession('session-1');
      mockStore._activeSessions.add('session-1');

      await manager.shutdownAll();

      expect(mockStore.clearSession).toHaveBeenCalledWith('session-1');
      expect(manager.activeSessionCount).toBe(0);
    });
  });
});
