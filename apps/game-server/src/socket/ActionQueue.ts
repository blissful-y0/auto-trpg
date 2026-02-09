// 세션별 순차 액션 큐 — 동시 액션 순서 보장 및 에러 격리

import type { QueueItem } from './types';

export class ActionQueue {
  private queues: Map<string, QueueItem[]> = new Map();
  private processing: Map<string, boolean> = new Map();

  // 액션 큐에 추가 및 실행
  async enqueue<T = unknown>(
    sessionId: string,
    handler: () => Promise<T>,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const item: QueueItem = {
        resolve: resolve as (value: unknown) => void,
        reject,
        handler: handler as () => Promise<unknown>,
      };

      if (!this.queues.has(sessionId)) {
        this.queues.set(sessionId, []);
      }

      this.queues.get(sessionId)!.push(item);

      // 현재 처리 중이 아니면 즉시 처리 시작
      if (!this.processing.get(sessionId)) {
        this.processNext(sessionId);
      }
    });
  }

  // 큐에서 다음 항목 처리
  private async processNext(sessionId: string): Promise<void> {
    const queue = this.queues.get(sessionId);
    if (!queue || queue.length === 0) {
      this.processing.set(sessionId, false);
      return;
    }

    this.processing.set(sessionId, true);
    const item = queue.shift()!;

    try {
      const result = await item.handler();
      item.resolve(result);
    } catch (error) {
      // 에러 격리: 한 액션 실패해도 다음 액션은 정상 처리
      item.reject(error instanceof Error ? error : new Error(String(error)));
    }

    // 다음 항목 처리
    await this.processNext(sessionId);
  }

  // 세션 큐 크기 조회
  getQueueSize(sessionId: string): number {
    return this.queues.get(sessionId)?.length ?? 0;
  }

  // 세션 큐 초기화
  clearQueue(sessionId: string): void {
    const queue = this.queues.get(sessionId);
    if (queue) {
      // 대기 중인 항목들에 에러 전달
      for (const item of queue) {
        item.reject(new Error('큐가 초기화되었습니다.'));
      }
      queue.length = 0;
    }
    this.processing.set(sessionId, false);
  }
}
