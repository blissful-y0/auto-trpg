'use client';

import { useSaveStore } from '@/lib/stores/saveStore';
import { Cloud, CloudOff, Loader2 } from 'lucide-react';

// 자동 세이브 상태 인디케이터 (헤더 영역에 표시)
export default function AutoSaveIndicator() {
  const { autoSaveStatus, lastAutoSaveAt } = useSaveStore();

  if (autoSaveStatus === 'idle' && !lastAutoSaveAt) return null;

  const statusConfig = {
    idle: {
      icon: Cloud,
      text: lastAutoSaveAt
        ? `자동 저장됨 ${new Date(lastAutoSaveAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}`
        : '',
      className: 'text-text-tertiary',
    },
    saving: {
      icon: Loader2,
      text: '자동 저장 중...',
      className: 'text-amber-400',
    },
    saved: {
      icon: Cloud,
      text: '자동 저장됨',
      className: 'text-emerald-400',
    },
    error: {
      icon: CloudOff,
      text: '자동 저장 실패',
      className: 'text-red-400',
    },
  } as const;

  const config = statusConfig[autoSaveStatus];
  const Icon = config.icon;

  return (
    <div className={`flex items-center gap-1 text-[10px] ${config.className}`}>
      <Icon size={12} className={autoSaveStatus === 'saving' ? 'animate-spin' : ''} />
      <span>{config.text}</span>
    </div>
  );
}
