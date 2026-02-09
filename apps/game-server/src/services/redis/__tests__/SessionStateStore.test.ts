import { describe, it, expect, beforeEach, vi } from 'vitest';

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

import type Redis from 'ioredis';
import { SessionStateStore } from '../SessionStateStore';
import { REDIS_KEYS, DEFAULT_TTL, type SessionState, type CharacterState, type RedisMessage } from '../types';

// Redis mock 생성
function createMockRedis() {
  const store: Record<string, string> = {};
  const hashStore: Record<string, Record<string, string>> = {};
  const listStore: Record<string, string[]> = {};
  const setStore: Record<string, Set<string>> = {};
  const ttlStore: Record<string, number> = {};

  const pipelineMock = {
    expire: vi.fn().mockReturnThis(),
    exec: vi.fn(async () => []),
  };

  return {
    // String 명령
    get: vi.fn(async (key: string) => store[key] ?? null),
    set: vi.fn(async (key: string, value: string, _mode?: string, _ttl?: number) => {
      store[key] = value;
      return 'OK';
    }),
    del: vi.fn(async (...keys: string[]) => {
      let count = 0;
      for (const key of keys) {
        if (store[key] || hashStore[key] || listStore[key]) {
          delete store[key];
          delete hashStore[key];
          delete listStore[key];
          count++;
        }
      }
      return count;
    }),
    expire: vi.fn(async (key: string, ttl: number) => {
      ttlStore[key] = ttl;
      return 1;
    }),

    // Hash 명령
    hset: vi.fn(async (key: string, field: string, value: string) => {
      if (!hashStore[key]) hashStore[key] = {};
      hashStore[key][field] = value;
      return 1;
    }),
    hget: vi.fn(async (key: string, field: string) => {
      return hashStore[key]?.[field] ?? null;
    }),
    hgetall: vi.fn(async (key: string) => {
      return hashStore[key] ?? {};
    }),
    hdel: vi.fn(async (key: string, field: string) => {
      if (hashStore[key]?.[field]) {
        delete hashStore[key][field];
        return 1;
      }
      return 0;
    }),
    hlen: vi.fn(async (key: string) => {
      return Object.keys(hashStore[key] ?? {}).length;
    }),

    // List 명령
    rpush: vi.fn(async (key: string, value: string) => {
      if (!listStore[key]) listStore[key] = [];
      listStore[key].push(value);
      return listStore[key].length;
    }),
    lrange: vi.fn(async (key: string, start: number, stop: number) => {
      const list = listStore[key] ?? [];
      const s = start < 0 ? Math.max(0, list.length + start) : start;
      const e = stop < 0 ? list.length + stop : stop;
      return list.slice(s, e + 1);
    }),
    llen: vi.fn(async (key: string) => {
      return (listStore[key] ?? []).length;
    }),
    ltrim: vi.fn(async (key: string, start: number, stop: number) => {
      const list = listStore[key] ?? [];
      listStore[key] = list.slice(start, stop < 0 ? list.length + stop + 1 : stop + 1);
      return 'OK';
    }),

    // Set 명령
    sadd: vi.fn(async (key: string, member: string) => {
      if (!setStore[key]) setStore[key] = new Set();
      const isNew = !setStore[key].has(member);
      setStore[key].add(member);
      return isNew ? 1 : 0;
    }),
    srem: vi.fn(async (key: string, member: string) => {
      if (setStore[key]?.has(member)) {
        setStore[key].delete(member);
        return 1;
      }
      return 0;
    }),
    smembers: vi.fn(async (key: string) => {
      return Array.from(setStore[key] ?? []);
    }),
    sismember: vi.fn(async (key: string, member: string) => {
      return setStore[key]?.has(member) ? 1 : 0;
    }),

    // Pipeline
    pipeline: vi.fn(() => pipelineMock),

    // 내부 접근용
    _store: store,
    _hashStore: hashStore,
    _listStore: listStore,
    _setStore: setStore,
    _ttlStore: ttlStore,
    _pipelineMock: pipelineMock,
  };
}

describe('SessionStateStore', () => {
  let mockRedis: ReturnType<typeof createMockRedis>;
  let store: SessionStateStore;

  const testSessionId = 'test-session-123';

  const testState: SessionState = {
    sessionId: testSessionId,
    status: 'active',
    gameSystem: 'dnd5e',
    currentScene: 3,
    worldState: {
      currentLocation: '팬달린 마을',
      timeOfDay: 'afternoon',
      weather: 'clear',
    },
    settings: { language: 'ko' },
    updatedAt: '2024-01-01T00:00:00.000Z',
  };

  const testCharacter: CharacterState = {
    characterId: 'char-1',
    name: '아라곤',
    race: '인간',
    class: '전사',
    level: 5,
    hpCurrent: 40,
    hpMax: 45,
    hpTemp: 0,
    armorClass: 16,
    inventory: JSON.stringify(['장검', '방패', '치유 물약 x2']),
    abilities: JSON.stringify(['세컨드 윈드', '액션 서지']),
    conditions: JSON.stringify([]),
    status: 'active',
  };

  beforeEach(() => {
    mockRedis = createMockRedis();
    store = new SessionStateStore(mockRedis as unknown as Redis);
  });

  // ─── 세션 상태 테스트 ───────────────────────────────

  describe('세션 상태', () => {
    it('세션 상태를 저장하고 조회해야 한다', async () => {
      await store.setSessionState(testSessionId, testState);
      const result = await store.getSessionState(testSessionId);

      expect(result).toEqual(testState);
      expect(mockRedis.set).toHaveBeenCalledWith(
        REDIS_KEYS.sessionState(testSessionId),
        JSON.stringify(testState),
        'EX',
        DEFAULT_TTL,
      );
    });

    it('존재하지 않는 세션 상태 조회 시 null을 반환해야 한다', async () => {
      const result = await store.getSessionState('nonexistent');
      expect(result).toBeNull();
    });

    it('세션 상태를 부분 업데이트할 수 있어야 한다', async () => {
      await store.setSessionState(testSessionId, testState);

      const updated = await store.updateSessionState(testSessionId, {
        status: 'paused',
        currentScene: 4,
      });

      expect(updated).not.toBeNull();
      expect(updated!.status).toBe('paused');
      expect(updated!.currentScene).toBe(4);
      expect(updated!.gameSystem).toBe('dnd5e');
    });

    it('존재하지 않는 세션을 업데이트하면 null을 반환해야 한다', async () => {
      const result = await store.updateSessionState('nonexistent', { status: 'paused' });
      expect(result).toBeNull();
    });
  });

  // ─── 캐릭터 상태 테스트 ─────────────────────────────

  describe('캐릭터 상태 (Redis Hash)', () => {
    it('캐릭터를 저장하고 조회해야 한다', async () => {
      await store.setCharacter(testSessionId, testCharacter);
      const result = await store.getCharacter(testSessionId, 'char-1');

      expect(result).toEqual(testCharacter);
    });

    it('여러 캐릭터를 저장하고 전체 조회해야 한다', async () => {
      const char2: CharacterState = {
        ...testCharacter,
        characterId: 'char-2',
        name: '레골라스',
        race: '엘프',
        class: '궁수',
      };

      await store.setCharacter(testSessionId, testCharacter);
      await store.setCharacter(testSessionId, char2);

      const all = await store.getAllCharacters(testSessionId);
      expect(all).toHaveLength(2);
      expect(all.map((c) => c.name)).toContain('아라곤');
      expect(all.map((c) => c.name)).toContain('레골라스');
    });

    it('캐릭터를 삭제할 수 있어야 한다', async () => {
      await store.setCharacter(testSessionId, testCharacter);
      const removed = await store.removeCharacter(testSessionId, 'char-1');

      expect(removed).toBe(true);
      expect(await store.getCharacter(testSessionId, 'char-1')).toBeNull();
    });

    it('존재하지 않는 캐릭터 삭제 시 false를 반환해야 한다', async () => {
      const removed = await store.removeCharacter(testSessionId, 'nonexistent');
      expect(removed).toBe(false);
    });

    it('캐릭터 수를 조회할 수 있어야 한다', async () => {
      await store.setCharacter(testSessionId, testCharacter);
      const count = await store.getCharacterCount(testSessionId);
      expect(count).toBe(1);
    });

    it('캐릭터 저장 시 TTL이 설정되어야 한다', async () => {
      await store.setCharacter(testSessionId, testCharacter);
      expect(mockRedis.expire).toHaveBeenCalledWith(
        REDIS_KEYS.sessionCharacters(testSessionId),
        DEFAULT_TTL,
      );
    });
  });

  // ─── 전투 상태 테스트 ───────────────────────────────

  describe('전투 상태', () => {
    const testCombat = {
      isActive: true,
      round: 2,
      currentTurnIndex: 1,
      combatants: [
        {
          id: 'char-1',
          name: '아라곤',
          initiative: 18,
          hpCurrent: 40,
          hpMax: 45,
          armorClass: 16,
          isPlayer: true,
          conditions: [],
        },
      ],
      startedAt: '2024-01-01T00:00:00.000Z',
    };

    it('전투 상태를 저장하고 조회해야 한다', async () => {
      await store.setCombatState(testSessionId, testCombat);
      const result = await store.getCombatState(testSessionId);
      expect(result).toEqual(testCombat);
    });

    it('전투 상태를 삭제할 수 있어야 한다', async () => {
      await store.setCombatState(testSessionId, testCombat);
      await store.clearCombatState(testSessionId);
      const result = await store.getCombatState(testSessionId);
      expect(result).toBeNull();
    });
  });

  // ─── 메시지 테스트 ──────────────────────────────────

  describe('메시지 (Redis List)', () => {
    const testMessage: RedisMessage = {
      id: 'msg-1',
      sessionId: testSessionId,
      senderId: 'user-1',
      senderType: 'player',
      content: '주변을 살펴봅니다.',
      isOOC: false,
      createdAt: '2024-01-01T00:00:00.000Z',
    };

    it('메시지를 추가하고 조회해야 한다', async () => {
      await store.addMessage(testSessionId, testMessage);
      const messages = await store.getRecentMessages(testSessionId, 10);

      expect(messages).toHaveLength(1);
      expect(messages[0]).toEqual(testMessage);
    });

    it('메시지 수를 조회할 수 있어야 한다', async () => {
      await store.addMessage(testSessionId, testMessage);
      await store.addMessage(testSessionId, { ...testMessage, id: 'msg-2' });

      const count = await store.getMessageCount(testSessionId);
      expect(count).toBe(2);
    });

    it('메시지 추가 시 TTL이 갱신되어야 한다', async () => {
      await store.addMessage(testSessionId, testMessage);
      expect(mockRedis.expire).toHaveBeenCalledWith(
        REDIS_KEYS.sessionMessages(testSessionId),
        DEFAULT_TTL,
      );
    });
  });

  // ─── TTL 갱신 테스트 ────────────────────────────────

  describe('TTL 갱신', () => {
    it('모든 키의 TTL을 갱신해야 한다', async () => {
      await store.refreshTTL(testSessionId);

      expect(mockRedis.pipeline).toHaveBeenCalled();
      expect(mockRedis._pipelineMock.expire).toHaveBeenCalledTimes(4);
    });
  });

  // ─── 활성 세션 관리 테스트 ──────────────────────────

  describe('활성 세션 관리', () => {
    it('활성 세션을 등록하고 조회해야 한다', async () => {
      await store.registerActiveSession(testSessionId);
      const sessions = await store.getActiveSessions();

      expect(sessions).toContain(testSessionId);
    });

    it('세션 활성 상태를 확인할 수 있어야 한다', async () => {
      await store.registerActiveSession(testSessionId);
      expect(await store.isSessionActive(testSessionId)).toBe(true);
      expect(await store.isSessionActive('nonexistent')).toBe(false);
    });

    it('활성 세션을 해제할 수 있어야 한다', async () => {
      await store.registerActiveSession(testSessionId);
      await store.unregisterActiveSession(testSessionId);
      expect(await store.isSessionActive(testSessionId)).toBe(false);
    });
  });

  // ─── 세션 정리 테스트 ───────────────────────────────

  describe('세션 정리', () => {
    it('세션의 모든 Redis 데이터를 삭제해야 한다', async () => {
      await store.setSessionState(testSessionId, testState);
      await store.setCharacter(testSessionId, testCharacter);
      await store.registerActiveSession(testSessionId);

      await store.clearSession(testSessionId);

      expect(mockRedis.del).toHaveBeenCalled();
      expect(mockRedis.srem).toHaveBeenCalledWith(
        REDIS_KEYS.activeSessions,
        testSessionId,
      );
    });
  });
});
