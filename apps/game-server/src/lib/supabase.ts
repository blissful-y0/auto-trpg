import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config';

// 서버 전용 서비스 역할 클라이언트 (RLS 우회)
export const supabaseAdmin: SupabaseClient = createClient(
  config.supabase.url,
  config.supabase.serviceRoleKey
);

// 사용자 컨텍스트 클라이언트 생성 (RLS 적용)
export function createUserClient(accessToken: string): SupabaseClient {
  return createClient(config.supabase.url, config.supabase.anonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}
