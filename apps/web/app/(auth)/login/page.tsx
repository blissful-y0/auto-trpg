'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { Loader2, Mail, Lock } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        toast.error(authError.message === 'Invalid login credentials'
          ? '이메일 또는 비밀번호가 올바르지 않습니다'
          : authError.message);
        setLoading(false);
        return;
      }
    } catch {
      toast.error('인증 서버에 연결할 수 없습니다. Supabase가 실행 중인지 확인하세요.');
      setLoading(false);
      return;
    }

    toast.success('로그인되었습니다');
    router.push('/dashboard');
  };

  return (
    <div>
      <h2 className="text-xl font-semibold text-slate-100 mb-6">로그인</h2>

      <form onSubmit={handleLogin} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm text-slate-300 mb-1.5">
            이메일
          </label>
          <div className="relative">
            <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
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
          <label htmlFor="password" className="block text-sm text-slate-300 mb-1.5">
            비밀번호
          </label>
          <div className="relative">
            <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="input-field pl-10"
              required
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="btn-primary w-full py-2.5 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              로그인 중...
            </>
          ) : (
            '로그인'
          )}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-400">
        계정이 없으신가요?{' '}
        <Link href="/signup" className="text-primary-400 hover:text-primary-300 font-medium">
          회원가입
        </Link>
      </p>
    </div>
  );
}
