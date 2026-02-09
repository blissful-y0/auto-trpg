import { createBrowserClient } from '@supabase/ssr';

// Supabase 서버 연결 실패 시 throw 대신 에러 응답을 반환하는 fetch 래퍼
const resilientFetch: typeof fetch = async (input, init) => {
  try {
    return await fetch(input, init);
  } catch {
    // 네트워크 에러 시 (Supabase 미실행 등) 에러 JSON 응답 반환
    return new Response(
      JSON.stringify({ message: '인증 서버에 연결할 수 없습니다.' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    );
  }
};

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { fetch: resilientFetch },
    },
  );
}
