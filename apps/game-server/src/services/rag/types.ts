// RAG 파이프라인 공통 타입 정의

/** 규칙서 카테고리 */
export type RulebookCategory =
  | 'COMBAT'
  | 'MAGIC'
  | 'SKILLS'
  | 'EQUIPMENT'
  | 'MONSTERS'
  | 'CHARACTER'
  | 'GENERAL';

/** 콘텐츠 유형 */
export type ContentType = 'rule' | 'table' | 'stat_block' | 'flavor' | 'example';

/** 청크 메타데이터 (청킹 전 입력) */
export interface ChunkMetadata {
  rulebookId: string;
  rulebookTitle?: string;
  pageOffset?: number;
}

/** 분할된 청크 */
export interface Chunk {
  content: string;
  page?: number;
  chapter?: string;
  section?: string;
  contentType: ContentType;
  category: RulebookCategory;
  tokenCount: number;
  metadata: Record<string, unknown>;
}

/** 문서 구조 감지 결과 */
export interface DocumentStructure {
  chapters: StructureNode[];
  tables: StructureRange[];
  statBlocks: StructureRange[];
}

/** 구조 노드 (챕터/섹션) */
export interface StructureNode {
  title: string;
  level: number;
  startIndex: number;
  endIndex: number;
  children: StructureNode[];
}

/** 구조 범위 (테이블/스탯 블록) */
export interface StructureRange {
  startIndex: number;
  endIndex: number;
  type: 'table' | 'stat_block';
}

/** 게임 컨텍스트 (검색 쿼리 빌드용) */
export interface GameContext {
  sessionId: string;
  rulebookIds: string[];
  currentScene?: string;
  activeCharacters?: string[];
}

/** 검색 옵션 */
export interface SearchOptions {
  rulebookIds: string[];
  categories?: RulebookCategory[];
  limit?: number;
  similarityThreshold?: number;
}

/** 검색 결과 */
export interface SearchResult {
  id: string;
  content: string;
  page?: number;
  chapter?: string;
  section?: string;
  category: string;
  similarity: number;
  textRank: number;
}

// ── 리랭킹 관련 타입 ─────────────────────────────────────

/** 리랭킹 결과 */
export interface RerankResult {
  id: string;
  content: string;
  category: string;
  originalScore: number;
  relevanceScore: number;
  page?: number;
  chapter?: string;
  section?: string;
}

// ── 규칙 체이닝 관련 타입 ─────────────────────────────────

/** 체이닝 사유 */
export type ChainReason =
  | 'same_section'
  | 'same_chapter'
  | 'explicit_reference'
  | 'prerequisite_rule';

/** 체이닝된 규칙 */
export interface ChainedRule {
  result: SearchResult;
  chainReason: ChainReason;
  chainScore: number;
}

// ── 핫 캐시 관련 타입 ─────────────────────────────────────

/** 핫 캐시 통계 */
export interface HotCacheStats {
  totalCached: number;
  hotCount: number;
  hitRate: number;
}

// ── 카테고리 분류 관련 타입 ────────────────────────────────

/** 카테고리 분류 결과 */
export interface ClassificationResult {
  category: RulebookCategory;
  confidence: number;
  method: 'keyword' | 'llm';
}

// ── 강화 검색 결과 타입 ───────────────────────────────────

/** 강화 검색 결과 (리랭킹 + 체이닝 포함) */
export interface EnhancedSearchResult {
  results: RerankResult[];
  chained: ChainedRule[];
  meta: {
    originalCount: number;
    rerankedCount: number;
    chainedCount: number;
    cacheHits: number;
    latencyMs: number;
  };
}
