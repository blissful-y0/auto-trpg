-- 012: Soft Delete 지원
-- 모든 엔티티 테이블에 deleted_at 컬럼 추가
-- deleted_at IS NULL → 활성 레코드, IS NOT NULL → 소프트 삭제됨

-- 1. deleted_at 컬럼 추가
ALTER TABLE rulebooks ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE game_sessions ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE user_api_keys ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE session_participants ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE save_points ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- 2. 부분 인덱스 (활성 레코드 조회 최적화)
CREATE INDEX IF NOT EXISTS idx_rulebooks_active ON rulebooks (user_id, created_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_game_sessions_active ON game_sessions (created_by, created_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_characters_active ON characters (session_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_campaigns_active ON campaigns (created_by, created_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_user_api_keys_active ON user_api_keys (user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_session_participants_active ON session_participants (session_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_save_points_active ON save_points (session_id, created_at) WHERE deleted_at IS NULL;

-- 3. 삭제된 레코드 정리용 인덱스
CREATE INDEX IF NOT EXISTS idx_rulebooks_deleted ON rulebooks (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_game_sessions_deleted ON game_sessions (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_characters_deleted ON characters (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_campaigns_deleted ON campaigns (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_api_keys_deleted ON user_api_keys (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_session_participants_deleted ON session_participants (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_save_points_deleted ON save_points (deleted_at) WHERE deleted_at IS NOT NULL;

-- 4. RLS 정책 업데이트 — 삭제된 레코드 자동 제외
-- rulebooks
DROP POLICY IF EXISTS "Users can view own rulebooks" ON rulebooks;
CREATE POLICY "Users can view own rulebooks" ON rulebooks
  FOR SELECT USING (auth.uid() = user_id AND deleted_at IS NULL);

-- game_sessions
DROP POLICY IF EXISTS "Users can view sessions they participate in" ON game_sessions;
CREATE POLICY "Users can view sessions they participate in" ON game_sessions
  FOR SELECT USING (
    deleted_at IS NULL AND
    EXISTS (
      SELECT 1 FROM session_participants
      WHERE session_participants.session_id = game_sessions.id
        AND session_participants.user_id = auth.uid()
        AND session_participants.deleted_at IS NULL
    )
  );

-- characters
DROP POLICY IF EXISTS "Session participants can view characters" ON characters;
CREATE POLICY "Session participants can view characters" ON characters
  FOR SELECT USING (
    deleted_at IS NULL AND
    EXISTS (
      SELECT 1 FROM session_participants
      WHERE session_participants.session_id = characters.session_id
        AND session_participants.user_id = auth.uid()
        AND session_participants.deleted_at IS NULL
    )
  );

-- campaigns
DROP POLICY IF EXISTS "Users can view own campaigns" ON campaigns;
CREATE POLICY "Users can view own campaigns" ON campaigns
  FOR SELECT USING (auth.uid() = created_by AND deleted_at IS NULL);

-- user_api_keys
DROP POLICY IF EXISTS "Users can view own keys" ON user_api_keys;
CREATE POLICY "Users can view own keys" ON user_api_keys
  FOR SELECT USING (auth.uid() = user_id AND deleted_at IS NULL);

-- session_participants
DROP POLICY IF EXISTS "Users can view session participants" ON session_participants;
CREATE POLICY "Users can view session participants" ON session_participants
  FOR SELECT USING (
    deleted_at IS NULL AND
    EXISTS (
      SELECT 1 FROM session_participants sp2
      WHERE sp2.session_id = session_participants.session_id
        AND sp2.user_id = auth.uid()
        AND sp2.deleted_at IS NULL
    )
  );

-- save_points
DROP POLICY IF EXISTS "Session participants can view saves" ON save_points;
CREATE POLICY "Session participants can view saves" ON save_points
  FOR SELECT USING (
    deleted_at IS NULL AND
    EXISTS (
      SELECT 1 FROM session_participants
      WHERE session_participants.session_id = save_points.session_id
        AND session_participants.user_id = auth.uid()
        AND session_participants.deleted_at IS NULL
    )
  );
