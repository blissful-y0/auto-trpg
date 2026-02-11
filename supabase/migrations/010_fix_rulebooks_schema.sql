-- ============================================================
-- 010_fix_rulebooks_schema.sql
-- 규칙서 테이블 스키마 수정 (코드-DB 정합성)
--
-- 수정 사항:
--   1. rulebooks 테이블 컬럼명 변경 (코드 컨벤션에 맞춤)
--   2. 누락된 컬럼 추가 (file_name, processing_status 등)
--   3. hybrid_search RPC 함수 생성 (가중치 파라미터 지원)
--   4. RLS 정책 재설정 (컬럼명 변경에 따라)
-- ============================================================

-- ─── 1. rulebooks 컬럼 이름 변경 ──────────────────────────
ALTER TABLE rulebooks RENAME COLUMN name TO title;
ALTER TABLE rulebooks RENAME COLUMN system TO game_system;
ALTER TABLE rulebooks RENAME COLUMN file_url TO s3_key;
ALTER TABLE rulebooks RENAME COLUMN file_size_bytes TO file_size;
ALTER TABLE rulebooks RENAME COLUMN error_message TO processing_error;

-- ─── 2. 누락 컬럼 추가 ────────────────────────────────────
ALTER TABLE rulebooks ADD COLUMN IF NOT EXISTS file_name TEXT;
ALTER TABLE rulebooks ADD COLUMN IF NOT EXISTS processing_status TEXT DEFAULT 'pending';
ALTER TABLE rulebooks ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;
-- updated_at은 002에서 이미 생성됨

-- status 제약 조건 확장 (기존 + 처리 완료 상태)
ALTER TABLE rulebooks DROP CONSTRAINT IF EXISTS rulebooks_status_check;
ALTER TABLE rulebooks ADD CONSTRAINT rulebooks_status_check
  CHECK (status IN ('uploading', 'processing', 'ready', 'error'));

-- processing_status 제약 조건
ALTER TABLE rulebooks ADD CONSTRAINT rulebooks_processing_status_check
  CHECK (processing_status IN (
    'pending', 'extracting', 'chunking', 'embedding', 'completed', 'failed'
  ));

-- ─── 3. hybrid_search RPC 함수 ────────────────────────────
-- 기존 search_rulebook_chunks 함수를 대체하는 새 함수
-- 가중치 파라미터를 지원하여 벡터/텍스트 검색 비율 조절 가능
CREATE OR REPLACE FUNCTION hybrid_search(
  query_text TEXT,
  query_embedding vector(1536),
  match_count INT DEFAULT 10,
  similarity_threshold FLOAT DEFAULT 0.3,
  rulebook_ids UUID[] DEFAULT '{}',
  filter_categories TEXT[] DEFAULT '{}',
  vector_weight FLOAT DEFAULT 0.7,
  text_weight FLOAT DEFAULT 0.3
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
    (1 - (rc.embedding <=> query_embedding))::FLOAT AS similarity,
    COALESCE(ts_rank(rc.tsv, plainto_tsquery('english', query_text)), 0)::FLOAT AS text_rank
  FROM rulebook_chunks rc
  WHERE
    -- 규칙서 필터 (빈 배열이면 전체 검색)
    (array_length(rulebook_ids, 1) IS NULL OR rc.rulebook_id = ANY(rulebook_ids))
    -- 카테고리 필터 (빈 배열이면 전체 검색)
    AND (array_length(filter_categories, 1) IS NULL OR rc.category = ANY(filter_categories))
    -- 유사도 임계값
    AND (1 - (rc.embedding <=> query_embedding)) > similarity_threshold
  ORDER BY
    (1 - (rc.embedding <=> query_embedding))::FLOAT * vector_weight
    + COALESCE(ts_rank(rc.tsv, plainto_tsquery('english', query_text)), 0)::FLOAT * text_weight
    DESC
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql;

-- 기존 함수는 유지 (하위 호환성)
-- search_rulebook_chunks는 그대로 두고, hybrid_search를 새로 추가

-- ─── 4. RLS 정책 재설정 ───────────────────────────────────
-- 컬럼명이 변경되었으므로 RLS 정책 재생성
DROP POLICY IF EXISTS "본인 규칙서 전체 접근" ON rulebooks;
CREATE POLICY "본인 규칙서 전체 접근" ON rulebooks FOR ALL
  USING (auth.uid() = user_id);
