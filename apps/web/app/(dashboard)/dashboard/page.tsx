'use client';

import Link from 'next/link';

// Mock 세션 데이터
const mockSessions = [
  {
    id: '1',
    name: '잃어버린 광산의 판델버',
    system: 'D&D 5e',
    playerCount: 3,
    maxPlayers: 4,
    status: 'active' as const,
    lastPlayed: '2024-01-15',
  },
  {
    id: '2',
    name: '공포의 저택',
    system: 'Call of Cthulhu 7e',
    playerCount: 2,
    maxPlayers: 5,
    status: 'paused' as const,
    lastPlayed: '2024-01-10',
  },
  {
    id: '3',
    name: '별들의 항해',
    system: 'Starfinder',
    playerCount: 4,
    maxPlayers: 4,
    status: 'completed' as const,
    lastPlayed: '2024-01-05',
  },
];

const statusLabels = {
  active: { text: '진행 중', className: 'bg-green-500/20 text-green-400' },
  paused: { text: '일시정지', className: 'bg-yellow-500/20 text-yellow-400' },
  completed: { text: '완료', className: 'bg-slate-500/20 text-slate-400' },
};

export default function DashboardPage() {
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

      {mockSessions.length === 0 ? (
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
          {mockSessions.map((session) => {
            const status = statusLabels[session.status];
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
                  <p>시스템: {session.system}</p>
                  <p>
                    플레이어: {session.playerCount}/{session.maxPlayers}
                  </p>
                  <p>마지막 플레이: {session.lastPlayed}</p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
