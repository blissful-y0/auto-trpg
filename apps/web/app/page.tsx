'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function Home() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
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
    <div className="flex items-center justify-center min-h-screen bg-bg-base">
      <div className="text-center animate-fade-in">
        <h1 className="font-serif text-display text-gold text-shadow mb-2">
          Auto TRPG
        </h1>
        <p className="text-text-tertiary text-body-sm">로딩 중...</p>
      </div>
    </div>
  );
}
