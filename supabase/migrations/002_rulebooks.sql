-- ============================================================
-- 002_rulebooks.sql
-- 규칙서 및 규칙서 청크 테이블
--
-- 이 마이그레이션은 다음을 수행합니다:
--   1. 규칙서 메타데이터 테이블 생성 (PDF 업로드 관리)
--   2. 규칙서 청크 + 임베딩 벡터 테이블 생성 (RAG용)
--   3. IVFFlat 벡터 검색 인덱스 및 전문 검색(tsvector) 설정
--   4. RLS 정책 설정
--   5. 하이브리드 검색 함수 (벡터 + 전문 검색) 생성
-- ============================================================

-- 규칙서 메타데이터
CREATE TABLE rulebooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  system TEXT NOT NULL DEFAULT 'custom', -- 'dnd5e', 'pathfinder', 'custom' 등
  file_url TEXT, -- S3 URL
  file_size_bytes BIGINT,
  page_count INT,
  status TEXT NOT NULL DEFAULT 'uploading' CHECK (status IN ('uploading', 'processing', 'ready', 'error')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 규칙서 청크 + 임베딩 벡터
CREATE TABLE rulebook_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rulebook_id UUID NOT NULL REFERENCES rulebooks(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  page INT,
  chapter TEXT,
  section TEXT,
  content_type TEXT NOT NULL DEFAULT 'rule' CHECK (content_type IN ('rule', 'table', 'stat_block', 'flavor', 'example')),
  category TEXT CHECK (category IN ('COMBAT', 'MAGIC', 'SKILLS', 'EQUIPMENT', 'MONSTERS', 'CHARACTER', 'GENERAL')),
  embedding vector(1536), -- OpenAI text-embedding-3-small
  metadata JSONB DEFAULT '{}',
  token_count INT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 인덱스
CREATE INDEX idx_chunks_rulebook ON rulebook_chunks(rulebook_id);
CREATE INDEX idx_chunks_category ON rulebook_chunks(category);
CREATE INDEX idx_chunks_content_type ON rulebook_chunks(content_type);

-- IVFFlat 벡터 검색 인덱스 (코사인 유사도)
CREATE INDEX idx_chunks_embedding ON rulebook_chunks
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- 전문 검색 (tsvector)
ALTER TABLE rulebook_chunks ADD COLUMN tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;
CREATE INDEX idx_chunks_tsv ON rulebook_chunks USING GIN(tsv);

-- RLS
ALTER TABLE rulebooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE rulebook_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "본인 규칙서 전체 접근" ON rulebooks FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "본인 규칙서 청크 조회" ON rulebook_chunks FOR SELECT
  USING (rulebook_id IN (SELECT id FROM rulebooks WHERE user_id = auth.uid()));

-- 하이브리드 검색 함수 (벡터 + 전문 검색)
CREATE OR REPLACE FUNCTION search_rulebook_chunks(
  query_embedding vector(1536),
  query_text TEXT,
  filter_rulebook_ids UUID[],
  filter_categories TEXT[] DEFAULT NULL,
  match_limit INT DEFAULT 10,
  similarity_threshold FLOAT DEFAULT 0.5
)
RETURNS TABLE (
  id UUID,
  rulebook_id UUID,
  content TEXT,
  page INT,
  chapter TEXT,
  section TEXT,
  content_type TEXT,
  category TEXT,
  similarity FLOAT,
  text_rank FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    rc.id,
    rc.rulebook_id,
    rc.content,
    rc.page,
    rc.chapter,
    rc.section,
    rc.content_type,
    rc.category,
    1 - (rc.embedding <=> query_embedding) AS similarity,
    COALESCE(ts_rank(rc.tsv, plainto_tsquery('english', query_text)), 0) AS text_rank
  FROM rulebook_chunks rc
  WHERE rc.rulebook_id = ANY(filter_rulebook_ids)
    AND (filter_categories IS NULL OR rc.category = ANY(filter_categories))
    AND 1 - (rc.embedding <=> query_embedding) > similarity_threshold
  ORDER BY similarity * 0.7 + text_rank * 0.3 DESC
  LIMIT match_limit;
END;
$$ LANGUAGE plpgsql;
