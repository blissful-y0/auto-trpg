'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        setError(authError.message);
        setLoading(false);
        return;
      }
    } catch {
      setError('인증 서버에 연결할 수 없습니다. Supabase가 실행 중인지 확인하세요.');
      setLoading(false);
      return;
    }

    router.push('/dashboard');
  };

  return (
    <div>
      <h2 className="text-xl font-semibold text-slate-100 mb-6">로그인</h2>

      <form onSubmit={handleLogin} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm text-slate-300 mb-1">
            이메일
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            className="input-field"
            required
          />
        </div>

        <div>
          <label
            htmlFor="password"
            className="block text-sm text-slate-300 mb-1"
          >
            비밀번호
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="input-field"
            required
          />
        </div>

        {error && (
          <p className="text-red-400 text-sm">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="btn-primary w-full disabled:opacity-50"
        >
          {loading ? '로그인 중...' : '로그인'}
        </button>
      </form>

      <div className="mt-6">
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-600" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-slate-800 text-slate-400">
              소셜 로그인
            </span>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <button className="btn-secondary w-full flex items-center justify-center gap-2">
            <span>Google로 계속하기</span>
          </button>
          <button className="btn-secondary w-full flex items-center justify-center gap-2">
            <span>Discord로 계속하기</span>
          </button>
        </div>
      </div>

      <p className="mt-6 text-center text-sm text-slate-400">
        계정이 없으신가요?{' '}
        <Link href="/signup" className="text-primary-400 hover:text-primary-300">
          회원가입
        </Link>
      </p>
    </div>
  );
}
