'use client';

import { useChatStore } from '@/lib/stores/chatStore';
import { BookOpen } from 'lucide-react';

export default function NarrativeLog() {
  const messages = useChatStore((state) => state.messages);

  // GM 메시지만 필터링하여 이야기 기록으로 표시
  const gmMessages = messages.filter((m) => m.type === 'gm');

  return (
    <div className="p-4 space-y-4">
      <h4 className="text-xs font-medium text-text-secondary uppercase tracking-wider">
        이야기 기록
      </h4>

      {gmMessages.length === 0 ? (
        <div className="flex flex-col items-center text-center py-10">
          <BookOpen size={28} className="text-text-tertiary mb-3" />
          <p className="text-sm text-text-tertiary">
            아직 기록된 이야기가 없습니다
          </p>
          <p className="text-xs text-text-tertiary mt-1">
            행동을 입력하면 GM의 내러티브가 여기에 표시됩니다
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {gmMessages.map((msg, i) => (
            <div key={msg.id} className="relative pl-4">
              {/* 타임라인 */}
              <div className="absolute left-0 top-2 w-2 h-2 bg-gold rounded-full ring-2 ring-gold/20" />
              {i < gmMessages.length - 1 && (
                <div className="absolute left-[3px] top-4 w-0.5 h-full bg-line" />
              )}
              <p className="narrative-text text-sm leading-relaxed whitespace-pre-wrap">
                {msg.content}
              </p>
              <span className="text-[10px] text-text-tertiary mt-1 block">
                {msg.timestamp}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
