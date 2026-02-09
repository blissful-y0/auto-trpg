'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    // TODO: 실제 인증 상태 확인 후 리다이렉트
    const isAuthenticated = false;

    if (isAuthenticated) {
      router.replace('/dashboard');
    } else {
      router.replace('/login');
    }
  }, [router]);

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
