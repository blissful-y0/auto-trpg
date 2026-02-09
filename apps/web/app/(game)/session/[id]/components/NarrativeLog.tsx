'use client';

import { useChatStore } from '@/lib/stores/chatStore';

export default function NarrativeLog() {
  const messages = useChatStore((state) => state.messages);

  // GM 메시지만 필터링하여 이야기 기록으로 표시
  const gmMessages = messages.filter((m) => m.type === 'gm');

  return (
    <div className="p-4 space-y-6">
      <h4 className="text-sm font-medium text-slate-300">이야기 기록</h4>

      {gmMessages.length === 0 ? (
        <p className="text-sm text-slate-500 text-center py-8">
          아직 기록된 이야기가 없습니다
        </p>
      ) : (
        <div className="space-y-3">
          {gmMessages.map((msg, i) => (
            <div key={msg.id} className="relative pl-4">
              {/* 타임라인 라인 */}
              <div className="absolute left-0 top-1.5 w-1.5 h-1.5 bg-amber-500/50 rounded-full" />
              {i < gmMessages.length - 1 && (
                <div className="absolute left-[2.5px] top-3 w-px h-full bg-slate-700" />
              )}
              <p className="text-sm text-slate-300 leading-relaxed">
                {msg.content}
              </p>
              <span className="text-xs text-slate-500 mt-1 block">
                {msg.timestamp}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
