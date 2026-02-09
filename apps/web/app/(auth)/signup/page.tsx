'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      alert('비밀번호가 일치하지 않습니다.');
      return;
    }
    setLoading(true);
    // TODO: Supabase 인증 연동
    console.log('회원가입 시도:', email, nickname);
    setLoading(false);
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
