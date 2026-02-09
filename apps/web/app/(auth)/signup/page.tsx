'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

export default function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError('비밀번호가 일치하지 않습니다.');
      return;
    }
    setLoading(true);
    setError('');

    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { display_name: nickname },
        },
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

    // 로컬 Supabase는 이메일 인증 없이 바로 로그인됨
    router.push('/dashboard');
  };

  return (
    <div>
      <h2 className="text-xl font-semibold text-slate-100 mb-6">회원가입</h2>

      <form onSubmit={handleSignup} className="space-y-4">
        <div>
          <label
            htmlFor="nickname"
            className="block text-sm text-slate-300 mb-1"
          >
            닉네임
          </label>
          <input
            id="nickname"
            type="text"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="모험가 이름"
            className="input-field"
            required
          />
        </div>

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
            minLength={8}
            required
          />
        </div>

        <div>
          <label
            htmlFor="confirmPassword"
            className="block text-sm text-slate-300 mb-1"
          >
            비밀번호 확인
          </label>
          <input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="••••••••"
            className="input-field"
            minLength={8}
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
          {loading ? '가입 중...' : '회원가입'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-400">
        이미 계정이 있으신가요?{' '}
        <Link href="/login" className="text-primary-400 hover:text-primary-300">
          로그인
        </Link>
      </p>
    </div>
  );
}
