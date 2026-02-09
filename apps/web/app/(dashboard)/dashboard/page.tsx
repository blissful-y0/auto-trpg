'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { sessionApi } from '@/lib/api';

const statusLabels: Record<string, { text: string; className: string }> = {
  waiting: { text: '대기 중', className: 'bg-blue-500/20 text-blue-400' },
  active: { text: '진행 중', className: 'bg-green-500/20 text-green-400' },
  paused: { text: '일시정지', className: 'bg-yellow-500/20 text-yellow-400' },
  completed: { text: '완료', className: 'bg-slate-500/20 text-slate-400' },
};

export default function DashboardPage() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    sessionApi.list()
      .then((res: any) => {
        setSessions(res?.data || []);
      })
      .catch((err: Error) => {
        setError(err.message);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-slate-400">세션 목록 불러오는 중...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-16">
        <p className="text-red-400 mb-2">세션 목록을 불러올 수 없습니다</p>
        <p className="text-sm text-slate-500">{error}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-slate-100">내 세션</h2>
          <p className="text-slate-400 mt-1">게임 세션을 관리하세요</p>
        </div>
        <Link href="/dashboard/sessions/new" className="btn-primary">
          + 새 세션 만들기
        </Link>
      </div>

      {sessions.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-slate-400 text-lg mb-4">
            아직 생성된 세션이 없습니다
          </p>
          <Link href="/dashboard/sessions/new" className="btn-primary">
            첫 번째 세션 만들기
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {sessions.map((session) => {
            const status = statusLabels[session.status] || statusLabels.waiting;
            return (
              <Link
                key={session.id}
                href={`/session/${session.id}`}
                className="card p-5 hover:border-primary-500/50 transition-colors group"
              >
                <div className="flex items-start justify-between mb-3">
                  <h3 className="font-semibold text-slate-100 group-hover:text-primary-400 transition-colors">
                    {session.name}
                  </h3>
                  <span
                    className={`text-xs px-2 py-1 rounded-full ${status.className}`}
                  >
                    {status.text}
                  </span>
                </div>
                <div className="space-y-1 text-sm text-slate-400">
                  <p>시스템: {session.game_system}</p>
                  <p>최대 인원: {session.max_players}</p>
                  <p>생성일: {new Date(session.created_at).toLocaleDateString('ko-KR')}</p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
