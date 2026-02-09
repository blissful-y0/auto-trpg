'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  Plus,
  Loader2,
  AlertCircle,
  Users,
  Gamepad2,
  Clock,
  CheckCircle2,
  Pause,
  Swords,
} from 'lucide-react';
import { sessionApi } from '@/lib/api';

const statusLabels: Record<string, { text: string; className: string; icon: React.ElementType }> = {
  waiting: { text: '대기 중', className: 'bg-blue-500/15 text-blue-400 border-blue-500/20', icon: Clock },
  active: { text: '진행 중', className: 'bg-green-500/15 text-green-400 border-green-500/20', icon: Swords },
  paused: { text: '일시정지', className: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/20', icon: Pause },
  completed: { text: '완료', className: 'bg-slate-500/15 text-slate-400 border-slate-500/20', icon: CheckCircle2 },
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
        toast.error('세션 목록을 불러올 수 없습니다');
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 size={28} className="animate-spin text-primary-400 mb-3" />
        <p className="text-slate-400 text-sm">세션 목록 불러오는 중...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center text-center py-20">
        <AlertCircle size={36} className="text-red-400 mb-3" />
        <p className="text-red-400 font-medium mb-1">세션 목록을 불러올 수 없습니다</p>
        <p className="text-sm text-slate-500 max-w-md">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 text-sm text-primary-400 hover:text-primary-300"
        >
          다시 시도
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <Gamepad2 size={24} className="text-primary-400" />
            내 세션
          </h2>
          <p className="text-slate-400 mt-1 text-sm">게임 세션을 관리하세요</p>
        </div>
        <Link
          href="/dashboard/sessions/new"
          className="btn-primary flex items-center gap-2"
        >
          <Plus size={16} />
          새 세션
        </Link>
      </div>

      {sessions.length === 0 ? (
        <div className="flex flex-col items-center text-center py-16 card p-8 border-dashed">
          <Gamepad2 size={40} className="text-slate-600 mb-4" />
          <p className="text-slate-400 text-lg mb-2">
            아직 생성된 세션이 없습니다
          </p>
          <p className="text-slate-500 text-sm mb-6">
            새 세션을 만들어 AI GM과 모험을 시작하세요
          </p>
          <Link
            href="/dashboard/sessions/new"
            className="btn-primary flex items-center gap-2"
          >
            <Plus size={16} />
            첫 번째 세션 만들기
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {sessions.map((session) => {
            const statusInfo = statusLabels[session.status] || statusLabels.waiting;
            const StatusIcon = statusInfo.icon;
            return (
              <Link
                key={session.id}
                href={`/session/${session.id}`}
                className="card p-5 hover:border-primary-500/30 transition-all group hover:shadow-lg hover:shadow-primary-500/5"
              >
                <div className="flex items-start justify-between mb-3">
                  <h3 className="font-semibold text-slate-100 group-hover:text-primary-400 transition-colors truncate pr-2">
                    {session.name}
                  </h3>
                  <span
                    className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border shrink-0 ${statusInfo.className}`}
                  >
                    <StatusIcon size={12} />
                    {statusInfo.text}
                  </span>
                </div>
                <div className="space-y-1.5 text-sm text-slate-400">
                  <p className="flex items-center gap-2">
                    <Swords size={14} className="text-slate-500 shrink-0" />
                    {session.game_system}
                  </p>
                  <p className="flex items-center gap-2">
                    <Users size={14} className="text-slate-500 shrink-0" />
                    최대 {session.max_players}명
                  </p>
                  <p className="flex items-center gap-2">
                    <Clock size={14} className="text-slate-500 shrink-0" />
                    {new Date(session.created_at).toLocaleDateString('ko-KR')}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
