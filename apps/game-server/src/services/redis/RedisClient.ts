// Redis 클라이언트 래퍼 — ioredis 연결 관리, 이벤트 로깅, graceful shutdown

import Redis from 'ioredis';
import { config } from '../../config';

let redisClient: Redis | null = null;
let subscriberClient: Redis | null = null;

// 메인 Redis 클라이언트 (읽기/쓰기)
export function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = createRedisInstance('main');
  }
  return redisClient;
}

// Pub/Sub 전용 클라이언트 (subscribe 모드에서는 다른 명령 사용 불가)
export function getSubscriberClient(): Redis {
  if (!subscriberClient) {
    subscriberClient = createRedisInstance('subscriber');
  }
  return subscriberClient;
}

// Redis 인스턴스 생성
function createRedisInstance(name: string): Redis {
  const client = new Redis(config.redis.url, {
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      // 최대 10초까지 지수 백오프
      const delay = Math.min(times * 500, 10000);
      console.log(`[Redis:${name}] 재연결 시도 #${times} (${delay}ms 후)`);
      return delay;
    },
    lazyConnect: false,
  });

  client.on('connect', () => {
    console.log(`[Redis:${name}] 연결 성공`);
  });

  client.on('ready', () => {
    console.log(`[Redis:${name}] 준비 완료`);
  });

  client.on('error', (err) => {
    console.error(`[Redis:${name}] 에러:`, err.message);
  });

  client.on('close', () => {
    console.log(`[Redis:${name}] 연결 종료`);
  });

  return client;
}

// Graceful shutdown — 모든 Redis 연결 종료
export async function shutdownRedis(): Promise<void> {
  const promises: Promise<void>[] = [];

  if (redisClient) {
    promises.push(
      redisClient.quit().then(() => {
        console.log('[Redis:main] 정상 종료');
        redisClient = null;
      }),
    );
  }

  if (subscriberClient) {
    promises.push(
      subscriberClient.quit().then(() => {
        console.log('[Redis:subscriber] 정상 종료');
        subscriberClient = null;
      }),
    );
  }

  await Promise.all(promises);
}

// 테스트용: 클라이언트를 외부에서 주입
export function setRedisClient(client: Redis): void {
  redisClient = client;
}

// 테스트용: 클라이언트 초기화
export function resetRedisClients(): void {
  redisClient = null;
  subscriberClient = null;
}
