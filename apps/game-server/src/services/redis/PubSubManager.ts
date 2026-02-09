// Pub/Sub 매니저 — Redis 채널 기반 이벤트 중계 (멀티프로세스 스케일링 대비)

import type Redis from 'ioredis';
import { getRedisClient, getSubscriberClient } from './RedisClient';
import { REDIS_KEYS } from './types';

// 이벤트 타입
export interface PubSubEvent {
  type: string;
  sessionId: string;
  data: unknown;
  timestamp: string;
  sourceProcessId?: string;
}

// 이벤트 핸들러 타입
export type EventHandler = (event: PubSubEvent) => void;

export class PubSubManager {
  private publisher: Redis;
  private subscriber: Redis;
  private handlers: Map<string, Set<EventHandler>> = new Map();
  private processId: string;

  constructor(publisher?: Redis, subscriber?: Redis) {
    this.publisher = publisher ?? getRedisClient();
    this.subscriber = subscriber ?? getSubscriberClient();
    this.processId = `proc-${process.pid}-${Date.now()}`;
  }

  // ─── 이벤트 발행 ──────────────────────────────────

  async publish(sessionId: string, type: string, data: unknown): Promise<void> {
    const channel = REDIS_KEYS.eventChannel(sessionId);
    const event: PubSubEvent = {
      type,
      sessionId,
      data,
      timestamp: new Date().toISOString(),
      sourceProcessId: this.processId,
    };
    await this.publisher.publish(channel, JSON.stringify(event));
  }

  // ─── 세션 구독 ────────────────────────────────────

  async subscribe(sessionId: string, handler: EventHandler): Promise<void> {
    const channel = REDIS_KEYS.eventChannel(sessionId);

    // 핸들러 등록
    if (!this.handlers.has(channel)) {
      this.handlers.set(channel, new Set());

      // Redis 채널 구독 (첫 핸들러 등록 시에만)
      await this.subscriber.subscribe(channel);
    }
    this.handlers.get(channel)!.add(handler);

    // 메시지 리스너 (한 번만 등록)
    if (this.handlers.size === 1) {
      this.subscriber.on('message', (ch: string, message: string) => {
        this.handleMessage(ch, message);
      });
    }
  }

  // ─── 세션 구독 해제 ────────────────────────────────

  async unsubscribe(sessionId: string, handler?: EventHandler): Promise<void> {
    const channel = REDIS_KEYS.eventChannel(sessionId);
    const handlers = this.handlers.get(channel);

    if (!handlers) return;

    if (handler) {
      handlers.delete(handler);
    } else {
      handlers.clear();
    }

    // 핸들러가 없으면 Redis 채널 구독 해제
    if (handlers.size === 0) {
      this.handlers.delete(channel);
      await this.subscriber.unsubscribe(channel);
    }
  }

  // ─── 메시지 처리 ──────────────────────────────────

  private handleMessage(channel: string, message: string): void {
    const handlers = this.handlers.get(channel);
    if (!handlers || handlers.size === 0) return;

    try {
      const event = JSON.parse(message) as PubSubEvent;

      // 같은 프로세스에서 발행한 이벤트는 무시 (로컬에서 이미 처리됨)
      if (event.sourceProcessId === this.processId) return;

      for (const handler of handlers) {
        try {
          handler(event);
        } catch (err) {
          console.error('[PubSubManager] 핸들러 에러:', err);
        }
      }
    } catch (err) {
      console.error('[PubSubManager] 메시지 파싱 에러:', err);
    }
  }

  // ─── 정리 ─────────────────────────────────────────

  async shutdown(): Promise<void> {
    // 모든 채널 구독 해제
    for (const channel of this.handlers.keys()) {
      await this.subscriber.unsubscribe(channel);
    }
    this.handlers.clear();

    console.log('[PubSubManager] 종료 완료');
  }
}
