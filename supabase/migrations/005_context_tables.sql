-- ============================================================
-- 005_context_tables.sql
-- 컨텍스트 관리 테이블 (장면 요약, 세션 요약, 스냅샷)
--
-- 이 마이그레이션은 다음을 수행합니다:
--   1. 장면 요약 테이블 생성 (Tier 2 메모리 — 장면 단위 요약)
--   2. 세션 요약 테이블 생성 (Tier 3 메모리 — 세션 단위 요약)
--   3. 세션 스냅샷 테이블 생성 (세이브/로드 기능)
--   4. 벡터 검색용 IVFFlat 인덱스 설정
--   5. RLS 정책 설정 (세션 참가자만 조회 가능)
-- ============================================================

-- 장면 요약 (Tier 2 메모리)
CREATE TABLE scene_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  scene_number INT NOT NULL,
  summary TEXT NOT NULL,
  key_events TEXT[] DEFAULT '{}', -- 핵심 사건 목록 (구조적 백업)
  active_characters TEXT[] DEFAULT '{}', -- 해당 장면의 활성 캐릭터
  location TEXT,
  embedding vector(1536),
  start_message_id UUID REFERENCES messages(id),
  end_message_id UUID REFERENCES messages(id),
  token_count INT, -- 요약 토큰 수
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 세션 요약 (Tier 3 메모리)
CREATE TABLE session_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  summary TEXT NOT NULL, -- 200-400 단어
  key_decisions TEXT[] DEFAULT '{}', -- 핵심 결정 사항
  plot_points TEXT[] DEFAULT '{}', -- 주요 줄거리 포인트
  embedding vector(1536),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 세션 스냅샷 (세이브/로드)
CREATE TABLE session_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  game_state JSONB NOT NULL, -- 전체 게임 상태
  characters_state JSONB NOT NULL, -- 모든 캐릭터 상태
  combat_state JSONB, -- 전투 상태 (전투 중이면)
  world_state JSONB NOT NULL, -- 월드 상태
  message_count INT NOT NULL,
  trigger TEXT NOT NULL DEFAULT 'auto' CHECK (trigger IN ('manual', 'auto', 'scene_change')),
  label TEXT, -- 사용자 지정 라벨 ("보스전 직전" 등)
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 인덱스
CREATE INDEX idx_scene_summaries_session ON scene_summaries(session_id);
CREATE INDEX idx_scene_summaries_embedding ON scene_summaries
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);
CREATE INDEX idx_session_summaries_session ON session_summaries(session_id);
CREATE INDEX idx_session_summaries_embedding ON session_summaries
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);
CREATE INDEX idx_snapshots_session ON session_snapshots(session_id);

-- RLS
ALTER TABLE scene_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "세션 참가자 장면요약 조회" ON scene_summaries FOR SELECT
  USING (session_id IN (SELECT session_id FROM session_participants WHERE user_id = auth.uid()));
CREATE POLICY "세션 참가자 세션요약 조회" ON session_summaries FOR SELECT
  USING (session_id IN (SELECT session_id FROM session_participants WHERE user_id = auth.uid()));
CREATE POLICY "세션 참가자 스냅샷 조회" ON session_snapshots FOR SELECT
  USING (session_id IN (SELECT session_id FROM session_participants WHERE user_id = auth.uid()));
