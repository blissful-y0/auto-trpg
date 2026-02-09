// 세션 상태 저장소 — Redis CRUD (상태, 캐릭터, 전투, 메시지)

import type Redis from 'ioredis';
import { getRedisClient } from './RedisClient';
import {
  REDIS_KEYS,
  DEFAULT_TTL,
  MAX_MESSAGES,
  type SessionState,
  type CharacterState,
  type CombatState,
  type RedisMessage,
} from './types';

export class SessionStateStore {
  private redis: Redis;

  constructor(redis?: Redis) {
    this.redis = redis ?? getRedisClient();
  }

  // ─── 세션 상태 (JSON) ─────────────────────────────

  // 세션 상태 저장
  async setSessionState(sessionId: string, state: SessionState): Promise<void> {
    const key = REDIS_KEYS.sessionState(sessionId);
    await this.redis.set(key, JSON.stringify(state), 'EX', DEFAULT_TTL);
  }

  // 세션 상태 조회
  async getSessionState(sessionId: string): Promise<SessionState | null> {
    const key = REDIS_KEYS.sessionState(sessionId);
    const data = await this.redis.get(key);
    if (!data) return null;
    return JSON.parse(data) as SessionState;
  }

  // 세션 상태 부분 업데이트
  async updateSessionState(
    sessionId: string,
    updates: Partial<SessionState>,
  ): Promise<SessionState | null> {
    const current = await this.getSessionState(sessionId);
    if (!current) return null;

    const updated: SessionState = {
      ...current,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    await this.setSessionState(sessionId, updated);
    return updated;
  }

  // ─── 캐릭터 상태 (Redis Hash) ──────────────────────

  // 캐릭터 상태 저장 (개별)
  async setCharacter(sessionId: string, character: CharacterState): Promise<void> {
    const key = REDIS_KEYS.sessionCharacters(sessionId);
    await this.redis.hset(key, character.characterId, JSON.stringify(character));
    await this.redis.expire(key, DEFAULT_TTL);
  }

  // 캐릭터 상태 조회 (개별)
  async getCharacter(sessionId: string, characterId: string): Promise<CharacterState | null> {
    const key = REDIS_KEYS.sessionCharacters(sessionId);
    const data = await this.redis.hget(key, characterId);
    if (!data) return null;
    return JSON.parse(data) as CharacterState;
  }

  // 모든 캐릭터 상태 조회
  async getAllCharacters(sessionId: string): Promise<CharacterState[]> {
    const key = REDIS_KEYS.sessionCharacters(sessionId);
    const data = await this.redis.hgetall(key);
    return Object.values(data).map((v) => JSON.parse(v) as CharacterState);
  }

  // 캐릭터 삭제
  async removeCharacter(sessionId: string, characterId: string): Promise<boolean> {
    const key = REDIS_KEYS.sessionCharacters(sessionId);
    const removed = await this.redis.hdel(key, characterId);
    return removed > 0;
  }

  // 캐릭터 수 조회
  async getCharacterCount(sessionId: string): Promise<number> {
    const key = REDIS_KEYS.sessionCharacters(sessionId);
    return this.redis.hlen(key);
  }

  // ─── 전투 상태 (JSON) ──────────────────────────────

  // 전투 상태 저장
  async setCombatState(sessionId: string, combat: CombatState): Promise<void> {
    const key = REDIS_KEYS.sessionCombat(sessionId);
    await this.redis.set(key, JSON.stringify(combat), 'EX', DEFAULT_TTL);
  }

  // 전투 상태 조회
  async getCombatState(sessionId: string): Promise<CombatState | null> {
    const key = REDIS_KEYS.sessionCombat(sessionId);
    const data = await this.redis.get(key);
    if (!data) return null;
    return JSON.parse(data) as CombatState;
  }

  // 전투 상태 삭제 (전투 종료 시)
  async clearCombatState(sessionId: string): Promise<void> {
    const key = REDIS_KEYS.sessionCombat(sessionId);
    await this.redis.del(key);
  }

  // ─── 메시지 (Redis List) ───────────────────────────

  // 메시지 추가
  async addMessage(sessionId: string, message: RedisMessage): Promise<void> {
    const key = REDIS_KEYS.sessionMessages(sessionId);
    await this.redis.rpush(key, JSON.stringify(message));

    // 최대 수 초과 시 오래된 메시지 삭제
    const length = await this.redis.llen(key);
    if (length > MAX_MESSAGES) {
      await this.redis.ltrim(key, length - MAX_MESSAGES, -1);
    }

    await this.redis.expire(key, DEFAULT_TTL);
  }

  // 최근 N개 메시지 조회
  async getRecentMessages(sessionId: string, count: number = 50): Promise<RedisMessage[]> {
    const key = REDIS_KEYS.sessionMessages(sessionId);
    const data = await this.redis.lrange(key, -count, -1);
    return data.map((v) => JSON.parse(v) as RedisMessage);
  }

  // 전체 메시지 수 조회
  async getMessageCount(sessionId: string): Promise<number> {
    const key = REDIS_KEYS.sessionMessages(sessionId);
    return this.redis.llen(key);
  }

  // ─── TTL 갱신 ──────────────────────────────────────

  // 세션 관련 모든 키의 TTL 갱신
  async refreshTTL(sessionId: string): Promise<void> {
    const keys = [
      REDIS_KEYS.sessionState(sessionId),
      REDIS_KEYS.sessionCharacters(sessionId),
      REDIS_KEYS.sessionCombat(sessionId),
      REDIS_KEYS.sessionMessages(sessionId),
    ];

    const pipeline = this.redis.pipeline();
    for (const key of keys) {
      pipeline.expire(key, DEFAULT_TTL);
    }
    await pipeline.exec();
  }

  // ─── 세션 정리 ─────────────────────────────────────

  // 세션의 모든 Redis 데이터 삭제
  async clearSession(sessionId: string): Promise<void> {
    const keys = [
      REDIS_KEYS.sessionState(sessionId),
      REDIS_KEYS.sessionCharacters(sessionId),
      REDIS_KEYS.sessionCombat(sessionId),
      REDIS_KEYS.sessionMessages(sessionId),
      REDIS_KEYS.sessionQueue(sessionId),
    ];

    await this.redis.del(...keys);
    await this.redis.srem(REDIS_KEYS.activeSessions, sessionId);
  }

  // ─── 활성 세션 관리 ────────────────────────────────

  // 활성 세션 등록
  async registerActiveSession(sessionId: string): Promise<void> {
    await this.redis.sadd(REDIS_KEYS.activeSessions, sessionId);
  }

  // 활성 세션 해제
  async unregisterActiveSession(sessionId: string): Promise<void> {
    await this.redis.srem(REDIS_KEYS.activeSessions, sessionId);
  }

  // 모든 활성 세션 ID 조회
  async getActiveSessions(): Promise<string[]> {
    return this.redis.smembers(REDIS_KEYS.activeSessions);
  }

  // 세션이 활성 상태인지 확인
  async isSessionActive(sessionId: string): Promise<boolean> {
    const result = await this.redis.sismember(REDIS_KEYS.activeSessions, sessionId);
    return result === 1;
  }
}
