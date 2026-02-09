'use client';

import Link from 'next/link';

// Mock 규칙서 데이터
const mockRulebooks = [
  {
    id: '1',
    name: "Player's Handbook",
    system: 'D&D 5e',
    status: 'ready' as const,
    pages: 320,
    uploadedAt: '2024-01-10',
  },
  {
    id: '2',
    name: "Dungeon Master's Guide",
    system: 'D&D 5e',
    status: 'processing' as const,
    pages: 290,
    uploadedAt: '2024-01-12',
  },
  {
    id: '3',
    name: 'Call of Cthulhu Keeper Rulebook',
    system: 'CoC 7e',
    status: 'error' as const,
    pages: 448,
    uploadedAt: '2024-01-13',
  },
];

const statusConfig = {
  ready: { text: '사용 가능', className: 'bg-green-500/20 text-green-400' },
  processing: { text: '처리 중', className: 'bg-yellow-500/20 text-yellow-400' },
  error: { text: '오류', className: 'bg-red-500/20 text-red-400' },
};

export default function RulebooksPage() {
  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-slate-100">규칙서 관리</h2>
          <p className="text-slate-400 mt-1">
            TRPG 규칙서를 업로드하고 관리하세요
          </p>
        </div>
        <Link href="/rulebooks/upload" className="btn-primary">
          + 규칙서 업로드
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {mockRulebooks.map((book) => {
          const status = statusConfig[book.status];
          return (
            <div key={book.id} className="card p-5 fantasy-border">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-slate-100 truncate">
                    {book.name}
                  </h3>
                  <p className="text-sm text-slate-400 mt-1">{book.system}</p>
                </div>
                <span
                  className={`text-xs px-2 py-1 rounded-full shrink-0 ml-2 ${status.className}`}
                >
                  {status.text}
                </span>
              </div>
              <div className="text-sm text-slate-500 space-y-1">
                <p>{book.pages} 페이지</p>
                <p>업로드: {book.uploadedAt}</p>
              </div>
              {book.status === 'ready' && (
                <div className="mt-3 pt-3 border-t border-slate-700">
                  <button className="text-xs text-red-400 hover:text-red-300">
                    삭제
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
