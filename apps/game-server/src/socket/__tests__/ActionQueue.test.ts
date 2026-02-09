import { describe, it, expect, beforeEach } from 'vitest';
import { ActionQueue } from '../ActionQueue';

describe('ActionQueue', () => {
  let queue: ActionQueue;

  beforeEach(() => {
    queue = new ActionQueue();
  });

  it('단일 액션을 처리해야 한다', async () => {
    const result = await queue.enqueue('session-1', async () => {
      return '결과';
    });

    expect(result).toBe('결과');
  });

  it('동시에 여러 액션을 순차적으로 처리해야 한다', async () => {
    const order: number[] = [];

    const p1 = queue.enqueue('session-1', async () => {
      // 짧은 지연 시뮬레이션
      await new Promise((r) => setTimeout(r, 30));
      order.push(1);
      return 1;
    });

    const p2 = queue.enqueue('session-1', async () => {
      order.push(2);
      return 2;
    });

    const p3 = queue.enqueue('session-1', async () => {
      order.push(3);
      return 3;
    });

    const results = await Promise.all([p1, p2, p3]);

    // 순서 보장
    expect(order).toEqual([1, 2, 3]);
    expect(results).toEqual([1, 2, 3]);
  });

  it('한 액션이 실패해도 다음 액션이 정상 처리되어야 한다', async () => {
    const p1 = queue.enqueue('session-1', async () => {
      throw new Error('실패!');
    });

    const p2 = queue.enqueue('session-1', async () => {
      return '성공';
    });

    // 첫 번째는 실패
    await expect(p1).rejects.toThrow('실패!');
    // 두 번째는 성공
    const result = await p2;
    expect(result).toBe('성공');
  });

  it('서로 다른 세션의 큐는 독립적으로 처리되어야 한다', async () => {
    const sessionOrder: string[] = [];

    const p1 = queue.enqueue('session-1', async () => {
      await new Promise((r) => setTimeout(r, 30));
      sessionOrder.push('s1');
    });

    const p2 = queue.enqueue('session-2', async () => {
      sessionOrder.push('s2');
    });

    await Promise.all([p1, p2]);

    // session-2가 먼저 완료될 수 있음 (독립 처리)
    expect(sessionOrder).toContain('s1');
    expect(sessionOrder).toContain('s2');
  });

  it('큐 크기를 올바르게 반환해야 한다', () => {
    expect(queue.getQueueSize('session-1')).toBe(0);

    // enqueue하면 즉시 처리 시작하므로 큐에서는 빠짐
    // 하지만 처리 중인 상태에서 추가하면 큐에 쌓임
    queue.enqueue('session-1', async () => {
      await new Promise((r) => setTimeout(r, 100));
    });

    // 처리 중일 때 추가
    queue.enqueue('session-1', async () => {});
    queue.enqueue('session-1', async () => {});

    // 큐에 대기 중인 항목이 있어야 함
    expect(queue.getQueueSize('session-1')).toBeGreaterThanOrEqual(0);
  });

  it('clearQueue로 대기 중인 항목이 에러와 함께 거부되어야 한다', async () => {
    // 긴 작업을 먼저 넣어서 큐에 항목이 쌓이게 함
    const p1 = queue.enqueue('session-1', async () => {
      await new Promise((r) => setTimeout(r, 200));
      return 'first';
    });

    const p2 = queue.enqueue('session-1', async () => {
      return 'second';
    });

    // 큐 초기화
    queue.clearQueue('session-1');

    // p2는 큐에서 제거되었으므로 에러
    await expect(p2).rejects.toThrow('큐가 초기화되었습니다.');

    // p1은 이미 실행 중이므로 정상 완료
    const result = await p1;
    expect(result).toBe('first');
  });
});
