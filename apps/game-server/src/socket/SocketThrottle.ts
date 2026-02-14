// 소켓 이벤트별 유저 단위 스로틀러
// 슬라이딩 윈도우 방식으로 일정 시간 내 최대 이벤트 수를 제한

interface ThrottleConfig {
  /** 윈도우 시간(ms) */
  windowMs: number;
  /** 윈도우 내 최대 허용 이벤트 수 */
  maxEvents: number;
}

/** 기본 이벤트별 스로틀 설정 */
export const DEFAULT_THROTTLE_CONFIG: Record<string, ThrottleConfig> = {
  'player:action': { windowMs: 10_000, maxEvents: 5 },
  'chat:message': { windowMs: 10_000, maxEvents: 10 },
  'combat:action': { windowMs: 10_000, maxEvents: 5 },
  'dice:roll': { windowMs: 10_000, maxEvents: 10 },
};

export class SocketThrottle {
  // key: `${userId}:${eventName}` → 타임스탬프 배열
  private timestamps: Map<string, number[]> = new Map();
  private config: Record<string, ThrottleConfig>;

  constructor(config?: Record<string, ThrottleConfig>) {
    this.config = config ?? DEFAULT_THROTTLE_CONFIG;
  }

  /**
   * 이벤트 허용 여부 확인 및 기록
   * @returns true면 허용, false면 스로틀됨
   */
  allow(userId: string, eventName: string): boolean {
    const cfg = this.config[eventName];
    if (!cfg) return true; // 설정 없는 이벤트는 무제한

    const key = `${userId}:${eventName}`;
    const now = Date.now();
    const windowStart = now - cfg.windowMs;

    let timestamps = this.timestamps.get(key);
    if (!timestamps) {
      timestamps = [];
      this.timestamps.set(key, timestamps);
    }

    // 윈도우 밖의 오래된 타임스탬프 제거
    while (timestamps.length > 0 && timestamps[0] <= windowStart) {
      timestamps.shift();
    }

    if (timestamps.length >= cfg.maxEvents) {
      return false;
    }

    timestamps.push(now);
    return true;
  }

  /** 유저의 모든 스로틀 상태 초기화 (연결 종료 시) */
  clearUser(userId: string): void {
    for (const key of this.timestamps.keys()) {
      if (key.startsWith(`${userId}:`)) {
        this.timestamps.delete(key);
      }
    }
  }

  /** 남은 허용 횟수 조회 */
  remaining(userId: string, eventName: string): number {
    const cfg = this.config[eventName];
    if (!cfg) return Infinity;

    const key = `${userId}:${eventName}`;
    const now = Date.now();
    const windowStart = now - cfg.windowMs;

    const timestamps = this.timestamps.get(key);
    if (!timestamps) return cfg.maxEvents;

    const valid = timestamps.filter((t) => t > windowStart);
    return Math.max(0, cfg.maxEvents - valid.length);
  }
}
