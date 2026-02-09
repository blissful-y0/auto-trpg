-- ============================================================
-- 001_profiles.sql
-- 사용자 프로필 테이블 및 관련 설정
--
-- 이 마이그레이션은 다음을 수행합니다:
--   1. pgvector 확장 활성화 (벡터 검색용)
--   2. Supabase Auth와 연동되는 profiles 테이블 생성
--   3. RLS(행 수준 보안) 정책 설정
--   4. 신규 사용자 가입 시 프로필 자동 생성 트리거
-- ============================================================

-- pgvector 확장 활성화
CREATE EXTENSION IF NOT EXISTS vector;

-- 사용자 프로필 (Supabase Auth 확장)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  preferred_language TEXT DEFAULT 'ko',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS 활성화 및 정책
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "본인 프로필 조회" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "본인 프로필 수정" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "프로필 생성" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- 사용자 생성 시 프로필 자동 생성 트리거
-- search_path를 명시적으로 설정해야 supabase_auth_admin 컨텍스트에서도 public 스키마를 찾을 수 있음
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, display_name)
  VALUES (NEW.id, NEW.email, split_part(NEW.email, '@', 1));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
