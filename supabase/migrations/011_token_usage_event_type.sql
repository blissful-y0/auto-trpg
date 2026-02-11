-- ============================================================
-- 011_token_usage_event_type.sql
-- game_events에 token_usage 이벤트 타입 추가
--
-- 토큰 사용량 모니터링을 위해 event_type CHECK 제약에 추가
-- ============================================================

-- 기존 CHECK 제약 제거 후 재생성 (token_usage 추가)
ALTER TABLE game_events DROP CONSTRAINT IF EXISTS game_events_event_type_check;

ALTER TABLE game_events ADD CONSTRAINT game_events_event_type_check
  CHECK (event_type IN (
    'dice_roll', 'state_change', 'scene_change', 'combat_start', 'combat_end',
    'character_damage', 'character_heal', 'character_death', 'item_gain', 'item_lose',
    'npc_interact', 'skill_check', 'saving_throw', 'level_up', 'rest',
    'session_start', 'session_end', 'session_pause', 'session_resume',
    'token_usage'
  ));
