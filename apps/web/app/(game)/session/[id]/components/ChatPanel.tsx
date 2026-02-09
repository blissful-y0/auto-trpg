'use client';

import { useState, useRef, useEffect } from 'react';
import { useChatStore } from '@/lib/stores/chatStore';
import { useSocketStore } from '@/lib/stores/socketStore';
import { getSocket } from '@/lib/socket';

// 메시지 타입
type MessageType = 'player' | 'gm' | 'system' | 'ooc' | 'dice';

interface Props {
  sessionId: string;
}

export default function ChatPanel({ sessionId }: Props) {
  const { messages, isStreaming, streamingContent } = useChatStore();
  const { status } = useSocketStore();
  const [input, setInput] = useState('');
  const [isOOC, setIsOOC] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const socket = getSocket();
    if (!socket || status !== 'connected') return;

    if (isOOC) {
      // OOC 채팅 메시지
      socket.emit('chat:message', {
        sessionId,
        content: input,
        isOOC: true,
      });
    } else {
      // IC 플레이어 액션
      socket.emit('player:action', {
        sessionId,
        characterId: '', // TODO: 캐릭터 선택 연동
        action: 'message',
        message: input,
      });
    }

    // 자신의 메시지를 로컬에 즉시 추가
    useChatStore.getState().addMessage({
      id: `local-${Date.now()}`,
      type: isOOC ? 'ooc' : 'player',
      sender: '나',
      content: input,
      timestamp: new Date().toLocaleTimeString('ko-KR', {
        hour: '2-digit',
        minute: '2-digit',
      }),
    });

    setInput('');
  };

  const getMessageStyle = (type: MessageType) => {
    switch (type) {
      case 'gm':
        return 'gm-message rounded-lg p-3 my-1';
      case 'system':
        return 'system-message text-center py-2';
      case 'ooc':
        return 'ooc-message p-2 my-1';
      case 'dice':
        return 'bg-slate-700/50 rounded-lg p-3 my-1 border border-slate-600';
      default:
        return 'p-3 my-1';
    }
  };

  // 연결 상태 라벨
  const statusLabel: Record<string, { text: string; color: string }> = {
    connected: { text: '연결됨', color: 'text-green-400' },
    connecting: { text: '연결 중...', color: 'text-yellow-400' },
    reconnecting: { text: '재연결 중...', color: 'text-yellow-400' },
    disconnected: { text: '연결 끊김', color: 'text-red-400' },
  };

  const currentStatus = statusLabel[status] ?? statusLabel.disconnected;

  return (
    <div className="flex flex-col h-full">
      {/* 세션 헤더 */}
      <div className="px-4 py-3 border-b border-slate-700 bg-slate-800">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-slate-100">게임 세션</h2>
            <p className="text-xs text-slate-400">D&D 5e</p>
          </div>
          <span className={`text-xs ${currentStatus.color}`}>
            {currentStatus.text}
          </span>
        </div>
      </div>

      {/* 메시지 목록 */}
      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-1">
        {messages.map((msg) => (
          <div key={msg.id} className={getMessageStyle(msg.type)}>
            {msg.type !== 'system' && (
              <div className="flex items-center gap-2 mb-1">
                <span
                  className={`text-sm font-medium ${
                    msg.type === 'gm' ? 'text-amber-400' : 'text-primary-400'
                  }`}
                >
                  {msg.sender}
                </span>
                {msg.type === 'ooc' && (
                  <span className="text-xs text-slate-500">[OOC]</span>
                )}
                <span className="text-xs text-slate-500">{msg.timestamp}</span>
              </div>
            )}

            <p className="text-sm leading-relaxed">{msg.content}</p>

            {/* 주사위 결과 인라인 표시 */}
            {msg.diceResult && (
              <div className="mt-2 flex items-center gap-2 text-sm">
                <span className="text-slate-400">{msg.diceResult.notation}</span>
                <span className="text-slate-500">
                  [{msg.diceResult.rolls.join(', ')}]
                </span>
                {msg.diceResult.modifier !== 0 && (
                  <span className="text-slate-500">
                    {msg.diceResult.modifier > 0 ? '+' : ''}
                    {msg.diceResult.modifier}
                  </span>
                )}
                <span className="font-bold text-amber-400">
                  = {msg.diceResult.total}
                </span>
              </div>
            )}
          </div>
        ))}

        {/* GM 스트리밍 표시 */}
        {isStreaming && (
          <div className="gm-message rounded-lg p-3 my-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-medium text-amber-400">GM</span>
            </div>
            {streamingContent ? (
              <p className="text-sm leading-relaxed">{streamingContent}</p>
            ) : (
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 bg-amber-400 rounded-full animate-pulse" />
                <span className="w-2 h-2 bg-amber-400 rounded-full animate-pulse delay-100" />
                <span className="w-2 h-2 bg-amber-400 rounded-full animate-pulse delay-200" />
              </div>
            )}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 입력창 */}
      <div className="px-4 py-3 border-t border-slate-700 bg-slate-800">
        <form onSubmit={handleSend} className="flex gap-2">
          <button
            type="button"
            onClick={() => setIsOOC(!isOOC)}
            className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors shrink-0 ${
              isOOC
                ? 'bg-slate-600 text-slate-200'
                : 'bg-slate-700 text-slate-400 hover:text-slate-200'
            }`}
            title="OOC (Out of Character) 토글"
          >
            {isOOC ? 'OOC' : 'IC'}
          </button>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              status !== 'connected'
                ? '서버에 연결 중...'
                : isOOC
                  ? 'OOC 메시지...'
                  : '행동을 입력하세요...'
            }
            disabled={status !== 'connected'}
            className="input-field flex-1"
          />
          <button
            type="submit"
            disabled={status !== 'connected'}
            className="btn-primary shrink-0 disabled:opacity-50"
          >
            전송
          </button>
        </form>
      </div>
    </div>
  );
}
