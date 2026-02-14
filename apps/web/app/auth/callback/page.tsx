'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export default function AuthCallbackPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const processedRef = useRef(false);

  useEffect(() => {
    if (processedRef.current) {
      return;
    }

    const supabase = createClient();
    const code = searchParams.get('code');
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');
    // open redirect 방지 — 허용된 경로 접두사만 통과
    const nextPath = searchParams.get('next') ?? '/dashboard';
    const ALLOWED_PREFIXES = ['/dashboard', '/session', '/settings', '/rulebooks', '/campaigns'];
    const redirectTo = ALLOWED_PREFIXES.some((p) => nextPath === p || nextPath.startsWith(p + '/'))
      ? nextPath
      : '/dashboard';

    processedRef.current = true;

    const handleCallback = async () => {
      if (error) {
        toast.error(errorDescription || 'OAuth 인증이 취소되었거나 실패했습니다.');
        router.replace('/login');
        return;
      }

      if (!code) {
        toast.error('인증 코드가 없습니다.');
        router.replace('/login');
        return;
      }

      const { error: authError } = await supabase.auth.exchangeCodeForSession(code);
      if (authError) {
        toast.error(authError.message);
        router.replace('/login');
        return;
      }

      toast.success('로그인되었습니다');
      router.replace(redirectTo);
    };

    handleCallback();
  }, [searchParams, router]);

  return (
    <div className="min-h-screen bg-bg-base flex flex-col items-center justify-center px-4">
      <div className="card p-8 max-w-md w-full text-center space-y-4 animate-fade-in">
        <Loader2 size={28} className="mx-auto animate-spin text-gold" />
        <h1 className="text-heading-2 text-text-primary">인증 처리 중</h1>
        <p className="text-body-sm text-text-secondary">
          OAuth 로그인 응답을 처리하고 있습니다.
        </p>
        <p className="text-caption text-text-tertiary">
          문제가 계속되면{' '}
          <Link href="/login" className="text-gold hover:text-gold-dim">
            로그인 페이지
          </Link>
          로 이동해 주세요.
        </p>
      </div>
    </div>
  );
}
