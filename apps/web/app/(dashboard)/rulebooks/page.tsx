'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { rulebookApi } from '@/lib/api';

const statusConfig: Record<string, { text: string; className: string }> = {
  ready: { text: '사용 가능', className: 'bg-green-500/20 text-green-400' },
  processing: { text: '처리 중', className: 'bg-yellow-500/20 text-yellow-400' },
  error: { text: '오류', className: 'bg-red-500/20 text-red-400' },
};

export default function RulebooksPage() {
  const [rulebooks, setRulebooks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    rulebookApi.list()
      .then((res: any) => {
        setRulebooks(res?.data || []);
      })
      .catch((err: Error) => {
        setError(err.message);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-slate-400">규칙서 목록 불러오는 중...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-16">
        <p className="text-red-400 mb-2">규칙서 목록을 불러올 수 없습니다</p>
        <p className="text-sm text-slate-500">{error}</p>
      </div>
    );
  }

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

      {rulebooks.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-slate-400 text-lg mb-4">
            아직 업로드된 규칙서가 없습니다
          </p>
          <Link href="/rulebooks/upload" className="btn-primary">
            첫 번째 규칙서 업로드
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {rulebooks.map((book) => {
            // 백엔드 응답 필드 매핑: title→name, game_system→system
            const name = book.title || book.name;
            const system = book.game_system || book.system;
            const uploadedAt = book.created_at
              ? new Date(book.created_at).toLocaleDateString('ko-KR')
              : book.uploadedAt || '-';
            const status = statusConfig[book.status] || statusConfig.processing;

            return (
              <div key={book.id} className="card p-5 fantasy-border">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-slate-100 truncate">
                      {name}
                    </h3>
                    <p className="text-sm text-slate-400 mt-1">{system}</p>
                  </div>
                  <span
                    className={`text-xs px-2 py-1 rounded-full shrink-0 ml-2 ${status.className}`}
                  >
                    {status.text}
                  </span>
                </div>
                <div className="text-sm text-slate-500 space-y-1">
                  {book.pages && <p>{book.pages} 페이지</p>}
                  <p>업로드: {uploadedAt}</p>
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
      )}
    </div>
  );
}
