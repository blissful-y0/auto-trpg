'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function Home() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    // Supabase 세션 확인 후 리다이렉트
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        router.replace('/dashboard');
      } else {
        router.replace('/login');
      }
      setChecking(false);
    });
  }, [router]);

  if (!checking) return null;

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-amber-400 text-shadow mb-2">
          Auto TRPG
        </h1>
        <p className="text-slate-400">로딩 중...</p>
      </div>
    </div>
  );
}
