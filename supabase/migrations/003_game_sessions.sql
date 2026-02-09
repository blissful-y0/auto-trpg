-- ============================================================
-- 003_game_sessions.sql
-- 게임 세션, 참가자, 캐릭터, 세션-규칙서 연결 테이블
--
-- 이 마이그레이션은 다음을 수행합니다:
--   1. 게임 세션 테이블 생성 (세션 설정 및 월드 상태 관리)
--   2. 세션 참가자 테이블 생성 (플레이어/옵저버 역할)
--   3. 캐릭터 테이블 생성 (능력치, HP, 인벤토리 등)
--   4. 세션-규칙서 N:M 연결 테이블 생성
--   5. RLS 정책 설정 (참가자 기반 접근 제어)
-- ============================================================

-- 게임 세션
CREATE TABLE game_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES profiles(id),
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'active', 'paused', 'completed')),
  max_players INT NOT NULL DEFAULT 4 CHECK (max_players BETWEEN 1 AND 6),
  game_system TEXT NOT NULL DEFAULT 'dnd5e',
  settings JSONB NOT NULL DEFAULT '{}', -- GMPersonality, language 등
  world_state JSONB DEFAULT '{}', -- currentLocation, timeOfDay, weather, activeNPCs
  current_scene INT DEFAULT 1,
  primary_provider TEXT DEFAULT 'claude' CHECK (primary_provider IN ('claude', 'openai', 'gemini')),
  gm_aggressiveness TEXT DEFAULT 'balanced' CHECK (gm_aggressiveness IN ('passive', 'balanced', 'active')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 세션 참가자
CREATE TABLE session_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id),
  character_id UUID, -- FK는 characters 테이블 생성 후 추가
  role TEXT NOT NULL DEFAULT 'player' CHECK (role IN ('player', 'observer')),
  is_ready BOOLEAN DEFAULT false,
  joined_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(session_id, user_id)
);

-- 캐릭터
CREATE TABLE characters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id),
  name TEXT NOT NULL,
  race TEXT,
  class TEXT,
  level INT DEFAULT 1,
  stats JSONB NOT NULL DEFAULT '{"strength":10,"dexterity":10,"constitution":10,"intelligence":10,"wisdom":10,"charisma":10}',
  hit_points JSONB NOT NULL DEFAULT '{"current":10,"max":10,"temp":0}',
  armor_class INT DEFAULT 10,
  inventory JSONB DEFAULT '[]',
  abilities JSONB DEFAULT '[]',
  backstory TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'dead', 'retired', 'unconscious')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- session_participants에 character FK 추가
ALTER TABLE session_participants
  ADD CONSTRAINT fk_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE SET NULL;

-- 세션-규칙서 연결 (N:M)
CREATE TABLE session_rulebooks (
  session_id UUID NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  rulebook_id UUID NOT NULL REFERENCES rulebooks(id) ON DELETE CASCADE,
  PRIMARY KEY (session_id, rulebook_id)
);

-- 인덱스
CREATE INDEX idx_participants_session ON session_participants(session_id);
CREATE INDEX idx_participants_user ON session_participants(user_id);
CREATE INDEX idx_characters_session ON characters(session_id);
CREATE INDEX idx_characters_user ON characters(user_id);

-- RLS
ALTER TABLE game_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE characters ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_rulebooks ENABLE ROW LEVEL SECURITY;

-- 세션 참가자이면 세션 조회 가능
CREATE POLICY "세션 참가자 조회" ON game_sessions FOR SELECT
  USING (id IN (SELECT session_id FROM session_participants WHERE user_id = auth.uid())
    OR created_by = auth.uid());
CREATE POLICY "세션 생성자 수정" ON game_sessions FOR UPDATE USING (created_by = auth.uid());
CREATE POLICY "세션 생성" ON game_sessions FOR INSERT WITH CHECK (created_by = auth.uid());

CREATE POLICY "참가자 조회" ON session_participants FOR SELECT
  USING (session_id IN (SELECT session_id FROM session_participants WHERE user_id = auth.uid()));
CREATE POLICY "참가자 등록" ON session_participants FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "참가자 탈퇴" ON session_participants FOR DELETE USING (user_id = auth.uid());

CREATE POLICY "캐릭터 조회" ON characters FOR SELECT
  USING (session_id IN (SELECT session_id FROM session_participants WHERE user_id = auth.uid()));
CREATE POLICY "본인 캐릭터 수정" ON characters FOR ALL USING (user_id = auth.uid());

CREATE POLICY "세션 규칙서 조회" ON session_rulebooks FOR SELECT
  USING (session_id IN (SELECT session_id FROM session_participants WHERE user_id = auth.uid()));
