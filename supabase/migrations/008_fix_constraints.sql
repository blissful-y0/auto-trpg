-- ============================================================
-- 008_fix_constraints.sql
-- CHECK 제약 조건 수정
--
-- 수정 사항:
--   1. session_participants.role에 'gm' 값 추가
--   2. game_sessions.gm_aggressiveness 값 통일
--      ('passive', 'balanced', 'active') 유지 확인
-- ============================================================

-- session_participants.role: 'gm' 역할 추가
ALTER TABLE session_participants
  DROP CONSTRAINT IF EXISTS session_participants_role_check;

ALTER TABLE session_participants
  ADD CONSTRAINT session_participants_role_check
  CHECK (role IN ('player', 'observer', 'gm'));
