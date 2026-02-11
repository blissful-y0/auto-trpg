-- ============================================================
-- 009_campaigns_savepoints.sql
-- 캠페인 및 세이브포인트 테이블
--
-- 이 마이그레이션은 다음을 수행합니다:
--   1. 캠페인 테이블 생성 (멀티 세션 연결)
--   2. game_sessions에 campaign_id FK 추가
--   3. 세이브포인트 테이블 생성 (전체 상태 스냅샷)
--   4. RLS 정책 설정
-- ============================================================

-- ─── 캠페인 테이블 ──────────────────────────────────────
CREATE TABLE campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  game_system TEXT NOT NULL DEFAULT 'dnd5e',
  created_by UUID NOT NULL REFERENCES profiles(id),
  -- 캠페인 전체 상태 (세션 간 이어지는 월드 상태)
  world_state JSONB DEFAULT '{}',
  -- 캠페인 설정 (공통 규칙서 등)
  settings JSONB DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed', 'archived')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- game_sessions에 campaign_id FK 및 세션 순서 추가
ALTER TABLE game_sessions
  ADD COLUMN campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL;

ALTER TABLE game_sessions
  ADD COLUMN session_order INT DEFAULT 0;

CREATE INDEX idx_sessions_campaign ON game_sessions(campaign_id);

-- ─── 세이브포인트 테이블 ────────────────────────────────
CREATE TABLE save_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  -- 세이브 타입: manual(수동), auto(자동), pause(일시정지 시)
  save_type TEXT NOT NULL DEFAULT 'manual'
    CHECK (save_type IN ('manual', 'auto', 'pause')),
  -- 세이브 이름 (수동 세이브 시 사용자 지정)
  name TEXT NOT NULL DEFAULT '',
  -- 전체 상태 스냅샷 (Redis 상태의 직렬화)
  snapshot JSONB NOT NULL,
  -- 스냅샷 시점의 메타데이터
  scene_number INT NOT NULL DEFAULT 1,
  character_count INT NOT NULL DEFAULT 0,
  -- 누가 저장했는지
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_savepoints_session ON save_points(session_id);
CREATE INDEX idx_savepoints_session_type ON save_points(session_id, save_type);
-- 자동 세이브 정리용 (오래된 auto 세이브 삭제)
CREATE INDEX idx_savepoints_created ON save_points(session_id, created_at DESC);

-- ─── RLS 정책 ───────────────────────────────────────────

ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE save_points ENABLE ROW LEVEL SECURITY;

-- 캠페인: 생성자만 CRUD
CREATE POLICY "캠페인 생성자 조회" ON campaigns FOR SELECT
  USING (created_by = auth.uid());

CREATE POLICY "캠페인 생성" ON campaigns FOR INSERT
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "캠페인 생성자 수정" ON campaigns FOR UPDATE
  USING (created_by = auth.uid());

CREATE POLICY "캠페인 생성자 삭제" ON campaigns FOR DELETE
  USING (created_by = auth.uid());

-- 세이브포인트: 세션 참가자만 조회/생성
CREATE POLICY "세이브포인트 참가자 조회" ON save_points FOR SELECT
  USING (session_id IN (
    SELECT session_id FROM session_participants WHERE user_id = auth.uid()
  ));

CREATE POLICY "세이브포인트 참가자 생성" ON save_points FOR INSERT
  WITH CHECK (session_id IN (
    SELECT session_id FROM session_participants WHERE user_id = auth.uid()
  ));

-- 세이브포인트 삭제: 세션 생성자만
CREATE POLICY "세이브포인트 생성자 삭제" ON save_points FOR DELETE
  USING (session_id IN (
    SELECT id FROM game_sessions WHERE created_by = auth.uid()
  ));
