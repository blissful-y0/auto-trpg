-- ============================================================
-- 006_user_api_keys.sql
-- 사용자 LLM API 키 관리 및 공통 트리거
--
-- 이 마이그레이션은 다음을 수행합니다:
--   1. 사용자 API 키 테이블 생성 (BYOK — AES-256-GCM 암호화 저장)
--   2. 엄격한 RLS 정책 설정 (자신의 키만 CRUD 가능)
--   3. updated_at 자동 갱신 트리거 함수 생성
--   4. 모든 관련 테이블에 updated_at 트리거 적용
-- ============================================================

-- 사용자 LLM API 키 (BYOK — AES-256-GCM 암호화 저장)
CREATE TABLE user_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('claude', 'openai', 'gemini')),
  encrypted_key TEXT NOT NULL, -- AES-256-GCM 암호화된 키
  iv TEXT NOT NULL, -- 초기화 벡터
  key_hint TEXT NOT NULL, -- "sk-...Xf4g" (마지막 4자리 힌트)
  is_valid BOOLEAN DEFAULT true, -- 마지막 검증 결과
  last_validated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, provider)
);

-- RLS (매우 중요 — 자신의 키만 접근)
ALTER TABLE user_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "본인 API 키만 조회" ON user_api_keys FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "본인 API 키만 생성" ON user_api_keys FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "본인 API 키만 수정" ON user_api_keys FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "본인 API 키만 삭제" ON user_api_keys FOR DELETE USING (auth.uid() = user_id);

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- updated_at 트리거 적용 (모든 관련 테이블)
CREATE TRIGGER set_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON rulebooks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON game_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON characters
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON user_api_keys
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
