-- 013: API 키 회전/롤백을 위한 이전 키 보존 컬럼 추가
-- 기존 API 키 교체 시 이전 값을 롤백할 수 있도록 보관

ALTER TABLE user_api_keys ADD COLUMN IF NOT EXISTS previous_encrypted_key TEXT;
ALTER TABLE user_api_keys ADD COLUMN IF NOT EXISTS previous_iv TEXT;
ALTER TABLE user_api_keys ADD COLUMN IF NOT EXISTS previous_auth_tag TEXT;
ALTER TABLE user_api_keys ADD COLUMN IF NOT EXISTS previous_key_hint TEXT;

