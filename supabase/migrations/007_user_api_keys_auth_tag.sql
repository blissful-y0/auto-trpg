-- ============================================================
-- 007_user_api_keys_auth_tag.sql
-- user_api_keys 암호화 포맷 정규화
--
-- 목표:
--   1) auth_tag 컬럼 추가
--   2) 구형 packed 포맷(iv:authTag:cipher)을 분리 컬럼으로 백필
--   3) encrypted_key는 cipher 텍스트만 보관
--   4) iv/auth_tag NOT NULL 보장
-- ============================================================

ALTER TABLE user_api_keys
  ADD COLUMN IF NOT EXISTS auth_tag TEXT;

-- 구형 packed 포맷 백필
UPDATE user_api_keys
SET
  iv = CASE
    WHEN (iv IS NULL OR iv = '') AND encrypted_key LIKE '%:%:%'
      THEN split_part(encrypted_key, ':', 1)
    ELSE iv
  END,
  auth_tag = CASE
    WHEN (auth_tag IS NULL OR auth_tag = '') AND encrypted_key LIKE '%:%:%'
      THEN split_part(encrypted_key, ':', 2)
    ELSE auth_tag
  END,
  encrypted_key = CASE
    WHEN encrypted_key LIKE '%:%:%'
      THEN split_part(encrypted_key, ':', 3)
    ELSE encrypted_key
  END;

DO $$
DECLARE
  missing_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO missing_count
  FROM user_api_keys
  WHERE iv IS NULL
     OR iv = ''
     OR auth_tag IS NULL
     OR auth_tag = '';

  IF missing_count > 0 THEN
    RAISE EXCEPTION 'user_api_keys backfill failed: % row(s) still missing iv/auth_tag', missing_count;
  END IF;
END $$;

ALTER TABLE user_api_keys
  ALTER COLUMN iv SET NOT NULL,
  ALTER COLUMN auth_tag SET NOT NULL;
