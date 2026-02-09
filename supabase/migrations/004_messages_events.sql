-- ============================================================
-- 004_messages_events.sql
-- 메시지(대화 이력) 및 게임 이벤트 로그 테이블
--
-- 이 마이그레이션은 다음을 수행합니다:
--   1. 메시지 테이블 생성 (플레이어/GM/시스템 대화 이력)
--   2. 게임 이벤트 로그 테이블 생성 (상태 변경의 진실의 원천)
--      - 이벤트 로그는 절대 요약/삭제하지 않음
--   3. 성능을 위한 복합 인덱스 설정
--   4. RLS 정책 설정 (세션 참가자만 접근 가능)
-- ============================================================

-- 메시지 (대화 이력)
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES profiles(id), -- NULL = 시스템/GM
  sender_type TEXT NOT NULL CHECK (sender_type IN ('player', 'gm', 'system')),
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}', -- diceRolls, rulesApplied, stateChanges 등
  is_ooc BOOLEAN DEFAULT false, -- Out of Character
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 게임 이벤트 로그 (상태 변경의 진실의 원천 — 절대 요약/삭제 안 함)
CREATE TABLE game_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'dice_roll', 'state_change', 'scene_change', 'combat_start', 'combat_end',
    'character_damage', 'character_heal', 'character_death', 'item_gain', 'item_lose',
    'npc_interact', 'skill_check', 'saving_throw', 'level_up', 'rest',
    'session_start', 'session_end', 'session_pause', 'session_resume'
  )),
  actor_id UUID REFERENCES profiles(id), -- 이벤트 발생자
  target_id UUID, -- 이벤트 대상 (캐릭터 또는 NPC)
  data JSONB NOT NULL DEFAULT '{}', -- 이벤트 상세 데이터
  message_id UUID REFERENCES messages(id), -- 관련 메시지
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 인덱스
CREATE INDEX idx_messages_session ON messages(session_id);
CREATE INDEX idx_messages_session_time ON messages(session_id, created_at);
CREATE INDEX idx_messages_sender ON messages(sender_id);
CREATE INDEX idx_events_session ON game_events(session_id);
CREATE INDEX idx_events_session_type ON game_events(session_id, event_type);
CREATE INDEX idx_events_session_time ON game_events(session_id, created_at);

-- RLS
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "세션 참가자 메시지 조회" ON messages FOR SELECT
  USING (session_id IN (SELECT session_id FROM session_participants WHERE user_id = auth.uid()));
CREATE POLICY "세션 참가자 메시지 작성" ON messages FOR INSERT
  WITH CHECK (session_id IN (SELECT session_id FROM session_participants WHERE user_id = auth.uid()));

CREATE POLICY "세션 참가자 이벤트 조회" ON game_events FOR SELECT
  USING (session_id IN (SELECT session_id FROM session_participants WHERE user_id = auth.uid()));
