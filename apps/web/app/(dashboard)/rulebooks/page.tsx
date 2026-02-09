'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  BookOpen,
  Upload,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Clock,
  FileText,
} from 'lucide-react';
import { rulebookApi } from '@/lib/api';

const statusConfig: Record<string, { text: string; className: string; icon: React.ElementType }> = {
  ready: { text: '사용 가능', className: 'bg-green-500/15 text-green-400 border-green-500/20', icon: CheckCircle2 },
  processing: { text: '처리 중', className: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/20', icon: Clock },
  error: { text: '오류', className: 'bg-red-500/15 text-red-400 border-red-500/20', icon: AlertCircle },
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
        toast.error('규칙서 목록을 불러올 수 없습니다');
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 size={28} className="animate-spin text-primary-400 mb-3" />
        <p className="text-slate-400 text-sm">규칙서 목록 불러오는 중...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center text-center py-20">
        <AlertCircle size={36} className="text-red-400 mb-3" />
        <p className="text-red-400 font-medium mb-1">규칙서 목록을 불러올 수 없습니다</p>
        <p className="text-sm text-slate-500 max-w-md">{error}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <BookOpen size={24} className="text-primary-400" />
            규칙서 관리
          </h2>
          <p className="text-slate-400 mt-1 text-sm">
            TRPG 규칙서를 업로드하고 관리하세요
          </p>
        </div>
        <Link
          href="/rulebooks/upload"
          className="btn-primary flex items-center gap-2"
        >
          <Upload size={16} />
          업로드
        </Link>
      </div>

      {rulebooks.length === 0 ? (
        <div className="flex flex-col items-center text-center py-16 card p-8 border-dashed">
          <FileText size={40} className="text-slate-600 mb-4" />
          <p className="text-slate-400 text-lg mb-2">
            아직 업로드된 규칙서가 없습니다
          </p>
          <p className="text-slate-500 text-sm mb-6">
            PDF 형식의 TRPG 규칙서를 업로드하면 AI GM이 참고합니다
          </p>
          <Link
            href="/rulebooks/upload"
            className="btn-primary flex items-center gap-2"
          >
            <Upload size={16} />
            첫 번째 규칙서 업로드
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {rulebooks.map((book) => {
            const name = book.title || book.name;
            const system = book.game_system || book.system;
            const uploadedAt = book.created_at
              ? new Date(book.created_at).toLocaleDateString('ko-KR')
              : book.uploadedAt || '-';
            const statusInfo = statusConfig[book.status] || statusConfig.processing;
            const StatusIcon = statusInfo.icon;

            return (
              <div key={book.id} className="card p-5 fantasy-border hover:border-amber-700/40 transition-all">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-slate-100 truncate">
                      {name}
                    </h3>
                    <p className="text-sm text-slate-400 mt-0.5">{system}</p>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border shrink-0 ml-2 ${statusInfo.className}`}
                  >
                    <StatusIcon size={12} />
                    {statusInfo.text}
                  </span>
                </div>
                <div className="text-sm text-slate-500 space-y-1">
                  {book.pages && (
                    <p className="flex items-center gap-2">
                      <FileText size={14} className="text-slate-600" />
                      {book.pages} 페이지
                    </p>
                  )}
                  <p className="flex items-center gap-2">
                    <Clock size={14} className="text-slate-600" />
                    {uploadedAt}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
