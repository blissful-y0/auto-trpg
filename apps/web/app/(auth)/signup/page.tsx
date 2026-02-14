'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { Github, Loader2, Mail, Lock, User, AlertCircle } from 'lucide-react';

type OAuthProvider = 'google' | 'github';

export default function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<OAuthProvider | null>(null);
  const router = useRouter();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast.error('비밀번호가 일치하지 않습니다');
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { display_name: nickname },
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (authError) {
        toast.error(authError.message);
        setLoading(false);
        return;
      }
    } catch {
      toast.error('인증 서버에 연결할 수 없습니다. Supabase가 실행 중인지 확인하세요.');
      setLoading(false);
      return;
    }

    toast.success('회원가입이 완료되었습니다');
    router.push('/dashboard');
  };

  const handleOAuth = async (provider: OAuthProvider) => {
    setOauthLoading(provider);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) {
        toast.error(error.message);
        setOauthLoading(null);
      }
    } catch {
      toast.error('OAuth 회원가입/로그인 요청을 시작할 수 없습니다.');
      setOauthLoading(null);
    }
  };

  return (
    <div>
      <h2 className="text-heading-2 text-text-primary mb-6">회원가입</h2>

      <form onSubmit={handleSignup} className="space-y-4">
        <div>
          <label htmlFor="nickname" className="block text-body-sm text-text-secondary mb-1.5">
            닉네임
          </label>
          <div className="relative">
            <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
            <input
              id="nickname"
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="모험가 이름"
              className="input-field pl-10"
              required
            />
          </div>
        </div>

        <div>
          <label htmlFor="email" className="block text-body-sm text-text-secondary mb-1.5">
            이메일
          </label>
          <div className="relative">
            <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              className="input-field pl-10"
              required
            />
          </div>
        </div>

        <div>
          <label htmlFor="password" className="block text-body-sm text-text-secondary mb-1.5">
            비밀번호
          </label>
          <div className="relative">
            <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="8자 이상"
              className="input-field pl-10"
              minLength={8}
              required
            />
          </div>
        </div>

        <div>
          <label htmlFor="confirmPassword" className="block text-body-sm text-text-secondary mb-1.5">
            비밀번호 확인
          </label>
          <div className="relative">
            <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="비밀번호를 다시 입력"
              className="input-field pl-10"
              minLength={8}
              required
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading || oauthLoading !== null}
          className="btn-primary w-full py-2.5 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              가입 중...
            </>
          ) : (
            '회원가입'
          )}
        </button>
      </form>

      <div className="mt-5">
        <div className="relative mb-4">
          <div className="border-t border-line" />
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-bg-surface px-3 text-xs text-text-tertiary">
            또는 소셜 회원가입
          </span>
        </div>

        <div className="grid grid-cols-1 gap-2">
          <button
            type="button"
            onClick={() => handleOAuth('google')}
            disabled={loading || oauthLoading !== null}
            className="btn-primary w-full py-2.5 bg-bg-overlay text-text-secondary border border-line hover:bg-bg-elevated flex items-center justify-center gap-2"
          >
            {oauthLoading === 'google' ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                연결 중...
              </>
            ) : (
              <>
                <AlertCircle size={16} />
                Google로 계속하기
              </>
            )}
          </button>
          <button
            type="button"
            onClick={() => handleOAuth('github')}
            disabled={loading || oauthLoading !== null}
            className="btn-primary w-full py-2.5 bg-bg-overlay text-text-secondary border border-line hover:bg-bg-elevated flex items-center justify-center gap-2"
          >
            {oauthLoading === 'github' ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                연결 중...
              </>
            ) : (
              <>
                <Github size={16} />
                GitHub로 계속하기
              </>
            )}
          </button>
        </div>
      </div>

      <p className="mt-6 text-center text-body-sm text-text-secondary">
        이미 계정이 있으신가요?{' '}
        <Link href="/login" className="text-gold hover:text-gold-dim font-medium">
          로그인
        </Link>
      </p>
    </div>
  );
}
