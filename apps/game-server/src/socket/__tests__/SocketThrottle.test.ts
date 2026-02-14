import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SocketThrottle } from '../SocketThrottle';

describe('SocketThrottle', () => {
  let throttle: SocketThrottle;

  beforeEach(() => {
    throttle = new SocketThrottle({
      'player:action': { windowMs: 1000, maxEvents: 3 },
      'chat:message': { windowMs: 1000, maxEvents: 5 },
    });
  });

  it('설정된 횟수까지 이벤트를 허용해야 한다', () => {
    expect(throttle.allow('user-1', 'player:action')).toBe(true);
    expect(throttle.allow('user-1', 'player:action')).toBe(true);
    expect(throttle.allow('user-1', 'player:action')).toBe(true);
  });

  it('설정된 횟수를 초과하면 거부해야 한다', () => {
    throttle.allow('user-1', 'player:action');
    throttle.allow('user-1', 'player:action');
    throttle.allow('user-1', 'player:action');

    expect(throttle.allow('user-1', 'player:action')).toBe(false);
  });

  it('서로 다른 유저는 독립적으로 스로틀되어야 한다', () => {
    throttle.allow('user-1', 'player:action');
    throttle.allow('user-1', 'player:action');
    throttle.allow('user-1', 'player:action');

    // user-1은 한도 초과
    expect(throttle.allow('user-1', 'player:action')).toBe(false);
    // user-2는 별도 카운트
    expect(throttle.allow('user-2', 'player:action')).toBe(true);
  });

  it('서로 다른 이벤트는 독립적으로 스로틀되어야 한다', () => {
    throttle.allow('user-1', 'player:action');
    throttle.allow('user-1', 'player:action');
    throttle.allow('user-1', 'player:action');

    // player:action은 한도 초과
    expect(throttle.allow('user-1', 'player:action')).toBe(false);
    // chat:message는 별도 카운트
    expect(throttle.allow('user-1', 'chat:message')).toBe(true);
  });

  it('설정 없는 이벤트는 무제한 허용해야 한다', () => {
    for (let i = 0; i < 100; i++) {
      expect(throttle.allow('user-1', 'unknown:event')).toBe(true);
    }
  });

  it('윈도우 시간이 지나면 다시 허용해야 한다', () => {
    vi.useFakeTimers();

    throttle.allow('user-1', 'player:action');
    throttle.allow('user-1', 'player:action');
    throttle.allow('user-1', 'player:action');
    expect(throttle.allow('user-1', 'player:action')).toBe(false);

    // 윈도우 시간(1초) 경과
    vi.advanceTimersByTime(1001);

    expect(throttle.allow('user-1', 'player:action')).toBe(true);

    vi.useRealTimers();
  });

  it('clearUser로 유저의 스로틀 상태를 초기화할 수 있어야 한다', () => {
    throttle.allow('user-1', 'player:action');
    throttle.allow('user-1', 'player:action');
    throttle.allow('user-1', 'player:action');
    expect(throttle.allow('user-1', 'player:action')).toBe(false);

    throttle.clearUser('user-1');

    expect(throttle.allow('user-1', 'player:action')).toBe(true);
  });

  it('remaining이 남은 허용 횟수를 올바르게 반환해야 한다', () => {
    expect(throttle.remaining('user-1', 'player:action')).toBe(3);

    throttle.allow('user-1', 'player:action');
    expect(throttle.remaining('user-1', 'player:action')).toBe(2);

    throttle.allow('user-1', 'player:action');
    throttle.allow('user-1', 'player:action');
    expect(throttle.remaining('user-1', 'player:action')).toBe(0);
  });

  it('설정 없는 이벤트의 remaining은 Infinity여야 한다', () => {
    expect(throttle.remaining('user-1', 'unknown:event')).toBe(Infinity);
  });
});
