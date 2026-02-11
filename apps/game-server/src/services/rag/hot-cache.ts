// Redis 기반 핫 캐시 — 자주 사용되는 규칙 청크를 캐싱하여 검색 성능 향상
import type Redis from 'ioredis';
import type { HotCacheStats, SearchResult } from './types';

/** 핫 캐시 설정 */
interface HotCacheConfig {
  /** 기본 TTL (초) */
  defaultTtlSeconds: number;
  /** 룰북당 최대 캐시 항목 수 */
  maxEntriesPerRulebook: number;
  /** "핫" 판정 접근 횟수 임계값 */
  hotThreshold: number;
  /** 통계 윈도우 (초) */
  statsWindowSeconds: number;
}

const DEFAULT_CONFIG: HotCacheConfig = {
  defaultTtlSeconds: 3600,
  maxEntriesPerRulebook: 100,
  hotThreshold: 3,
  statsWindowSeconds: 86400,
};

/** Redis 키 프리픽스 */
const KEY = {
  /** 개별 청크 데이터 — Hash */
  chunk: (id: string) => `rag:chunk:${id}`,
  /** 접근 횟수 — Sorted Set (score=접근수, member=chunkId) */
  access: (rulebookId: string) => `rag:access:${rulebookId}`,
  /** 핫 청크 목록 — Set */
  hot: (rulebookId: string) => `rag:hot:${rulebookId}`,
  /** 캐시 통계 — Hash */
  stats: (rulebookId: string) => `rag:stats:${rulebookId}`,
  /** 검색 결과 캐시 — String (JSON) */
  search: (queryHash: string) => `rag:search:${queryHash}`,
} as const;

export class HotCache {
  private redis: Redis;
  private config: HotCacheConfig;

  constructor(redis: Redis, config: Partial<HotCacheConfig> = {}) {
    this.redis = redis;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** 캐시에서 청크 조회 */
  async get(chunkId: string): Promise<SearchResult | null> {
    const data = await this.redis.hgetall(KEY.chunk(chunkId));
    if (!data || !data.content) {
      return null;
    }
    return this.deserializeResult(data);
  }

  /** 여러 청크 일괄 조회 (ioredis 파이프라인 사용) */
  async getMany(chunkIds: string[]): Promise<Map<string, SearchResult>> {
    const results = new Map<string, SearchResult>();
    if (chunkIds.length === 0) return results;

    const pipe = this.redis.pipeline();
    for (const id of chunkIds) {
      pipe.hgetall(KEY.chunk(id));
    }

    const responses = await this.executePipeline(pipe);
    if (!responses) return results;

    for (let i = 0; i < chunkIds.length; i++) {
      const [err, data] = responses[i] as [Error | null, Record<string, string>];
      if (!err && data && data.content) {
        results.set(chunkIds[i], this.deserializeResult(data));
      }
    }

    return results;
  }

  /** 청크를 캐시에 저장 */
  async set(result: SearchResult, rulebookId: string): Promise<void> {
    const key = KEY.chunk(result.id);
    const serialized = this.serializeResult(result, rulebookId);

    const pipe = this.redis.pipeline();
    pipe.hmset(key, serialized);
    pipe.expire(key, this.config.defaultTtlSeconds);
    await this.executePipeline(pipe);
  }

  /** 여러 청크 일괄 저장 */
  async setMany(results: SearchResult[], rulebookId: string): Promise<void> {
    if (results.length === 0) return;

    const pipe = this.redis.pipeline();
    for (const result of results) {
      const key = KEY.chunk(result.id);
      const serialized = this.serializeResult(result, rulebookId);
      pipe.hmset(key, serialized);
      pipe.expire(key, this.config.defaultTtlSeconds);
    }
    await this.executePipeline(pipe);
  }

  /** 접근 횟수 기록 + 핫 판정 */
  async recordAccess(chunkId: string, rulebookId: string): Promise<void> {
    const accessKey = KEY.access(rulebookId);
    const hotKey = KEY.hot(rulebookId);

    // 접근 횟수 증가
    const newScore = await this.redis.zincrby(accessKey, 1, chunkId);
    await this.redis.expire(accessKey, this.config.statsWindowSeconds);

    // 핫 임계값 도달 시 핫 세트에 추가
    if (parseFloat(String(newScore)) >= this.config.hotThreshold) {
      await this.redis.sadd(hotKey, chunkId);
      await this.redis.expire(hotKey, this.config.statsWindowSeconds);
    }

    // 통계 업데이트
    await this.redis.hincrby(KEY.stats(rulebookId), 'total_accesses', 1);
  }

  /** 룰북별 핫 규칙 목록 조회 (접근 횟수 기준 정렬) */
  async getHotRules(
    rulebookId: string,
    limit = 20,
  ): Promise<SearchResult[]> {
    const topChunkIds = await this.redis.zrevrange(
      KEY.access(rulebookId),
      0,
      limit - 1,
    );

    if (topChunkIds.length === 0) return [];

    const cached = await this.getMany(topChunkIds);
    return topChunkIds
      .map((id) => cached.get(id))
      .filter((r): r is SearchResult => r !== undefined);
  }

  /** 검색 결과 캐시 저장 (쿼리 해시 기반) */
  async setSearchResult(queryHash: string, results: SearchResult[]): Promise<void> {
    const key = KEY.search(queryHash);
    await this.redis.set(key, JSON.stringify(results), 'EX', 300);
  }

  /** 검색 결과 캐시 조회 */
  async getSearchResult(queryHash: string): Promise<SearchResult[] | null> {
    const data = await this.redis.get(KEY.search(queryHash));
    if (!data) return null;

    try {
      return JSON.parse(data) as SearchResult[];
    } catch {
      return null;
    }
  }

  /** 캐시 무효화 (룰북 재처리 시) */
  async invalidate(rulebookId: string): Promise<void> {
    const hotChunkIds = await this.redis.smembers(KEY.hot(rulebookId));
    const accessChunkIds = await this.redis.zrange(KEY.access(rulebookId), 0, -1);

    const allChunkIds = [...new Set([...hotChunkIds, ...accessChunkIds])];

    if (allChunkIds.length > 0) {
      const pipe = this.redis.pipeline();
      for (const id of allChunkIds) {
        pipe.del(KEY.chunk(id));
      }
      pipe.del(KEY.access(rulebookId));
      pipe.del(KEY.hot(rulebookId));
      pipe.del(KEY.stats(rulebookId));
      await this.executePipeline(pipe);
    }
  }

  /** 캐시 통계 조회 */
  async getStats(rulebookId: string): Promise<HotCacheStats> {
    const [hotCount, statsData, totalCached] = await Promise.all([
      this.redis.scard(KEY.hot(rulebookId)),
      this.redis.hgetall(KEY.stats(rulebookId)),
      this.redis.zcard(KEY.access(rulebookId)),
    ]);

    const totalAccesses = parseInt(statsData.total_accesses || '0', 10);
    const cacheHits = parseInt(statsData.cache_hits || '0', 10);

    return {
      totalCached,
      hotCount,
      hitRate: totalAccesses > 0 ? cacheHits / totalAccesses : 0,
    };
  }

  /** 캐시 히트 통계 기록 */
  async recordHit(rulebookId: string): Promise<void> {
    await this.redis.hincrby(KEY.stats(rulebookId), 'cache_hits', 1);
  }

  /** ioredis 파이프라인 실행 래퍼 (NOTE: ioredis Pipeline.exec 사용 — child_process 아님) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async executePipeline(pipe: ReturnType<Redis['pipeline']>): Promise<any[] | null> {
    // ioredis의 Pipeline 인스턴스에서 실행
    return pipe.exec();
  }

  /** SearchResult → Redis Hash 직렬화 */
  private serializeResult(
    result: SearchResult,
    rulebookId: string,
  ): Record<string, string> {
    return {
      id: result.id,
      content: result.content,
      category: result.category,
      similarity: String(result.similarity),
      textRank: String(result.textRank),
      rulebookId,
      ...(result.page !== undefined && { page: String(result.page) }),
      ...(result.chapter && { chapter: result.chapter }),
      ...(result.section && { section: result.section }),
    };
  }

  /** Redis Hash → SearchResult 역직렬화 */
  private deserializeResult(data: Record<string, string>): SearchResult {
    return {
      id: data.id,
      content: data.content,
      category: data.category,
      similarity: parseFloat(data.similarity || '0'),
      textRank: parseFloat(data.textRank || '0'),
      ...(data.page && { page: parseInt(data.page, 10) }),
      ...(data.chapter && { chapter: data.chapter }),
      ...(data.section && { section: data.section }),
    };
  }
}
