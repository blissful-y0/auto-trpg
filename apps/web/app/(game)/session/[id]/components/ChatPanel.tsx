'use client';

import { useState, useRef, useEffect } from 'react';
import { useChatStore } from '@/lib/stores/chatStore';
import { useSocketStore } from '@/lib/stores/socketStore';
import { getSocket } from '@/lib/socket';
import {
  Send,
  Wifi,
  WifiOff,
  Loader2,
  MessageCircle,
  ArrowLeft,
} from 'lucide-react';
import Link from 'next/link';

// 메시지 타입
type MessageType = 'player' | 'gm' | 'system' | 'ooc' | 'dice';

interface Props {
  sessionId: string;
  sessionName?: string;
  gameSystem?: string;
}

export default function ChatPanel({ sessionId, sessionName, gameSystem }: Props) {
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
      socket.emit('chat:message', {
        sessionId,
        content: input,
        isOOC: true,
      });
    } else {
      socket.emit('player:action', {
        sessionId,
        characterId: '',
        action: 'message',
        message: input,
      });
    }

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
        return 'gm-message rounded-xl p-3.5 my-1.5';
      case 'system':
        return 'system-message text-center py-2';
      case 'ooc':
        return 'ooc-message p-2.5 my-1 rounded-lg bg-slate-800/50';
      case 'dice':
        return 'bg-slate-700/30 rounded-xl p-3 my-1 border border-slate-600/30';
      default:
        return 'p-3 my-1 rounded-xl bg-slate-800/30';
    }
  };

  const isConnected = status === 'connected';

  return (
    <div className="flex flex-col h-full">
      {/* 세션 헤더 */}
      <div className="px-4 py-3 border-b border-slate-700/50 bg-slate-800/60 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 transition-colors"
              title="대시보드로 돌아가기"
            >
              <ArrowLeft size={18} />
            </Link>
            <div>
              <h2 className="font-semibold text-slate-100 text-sm">
                {sessionName || '게임 세션'}
              </h2>
              {gameSystem && (
                <p className="text-xs text-slate-500">{gameSystem}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {isConnected ? (
              <Wifi size={14} className="text-green-400" />
            ) : (
              <WifiOff size={14} className="text-red-400" />
            )}
            <span className={`text-xs ${isConnected ? 'text-green-400' : 'text-red-400'}`}>
              {isConnected ? '연결됨' : status === 'connecting' ? '연결 중...' : '연결 끊김'}
            </span>
          </div>
        </div>
      </div>

      {/* 메시지 목록 */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
        {messages.length === 0 && !isStreaming && (
          <div className="flex flex-col items-center text-center py-16">
            <MessageCircle size={32} className="text-slate-600 mb-3" />
            <p className="text-slate-500 text-sm">아직 메시지가 없습니다</p>
            <p className="text-slate-600 text-xs mt-1">행동을 입력하여 모험을 시작하세요</p>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={getMessageStyle(msg.type)}>
            {msg.type !== 'system' && (
              <div className="flex items-center gap-2 mb-1">
                <span
                  className={`text-xs font-semibold ${
                    msg.type === 'gm' ? 'text-amber-400' : 'text-primary-400'
                  }`}
                >
                  {msg.sender}
                </span>
                {msg.type === 'ooc' && (
                  <span className="text-[10px] text-slate-500 bg-slate-700/50 px-1.5 py-0.5 rounded">OOC</span>
                )}
                <span className="text-[10px] text-slate-600">{msg.timestamp}</span>
              </div>
            )}

            <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>

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
          <div className="gm-message rounded-xl p-3.5 my-1.5">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold text-amber-400">GM</span>
            </div>
            {streamingContent ? (
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{streamingContent}</p>
            ) : (
              <div className="flex items-center gap-1.5 py-1">
                <Loader2 size={14} className="animate-spin text-amber-400" />
                <span className="text-xs text-amber-400/70">GM이 생각하는 중...</span>
              </div>
            )}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 입력창 */}
      <div className="px-4 py-3 border-t border-slate-700/50 bg-slate-800/60 backdrop-blur-sm">
        <form onSubmit={handleSend} className="flex gap-2">
          <button
            type="button"
            onClick={() => setIsOOC(!isOOC)}
            className={`px-3 py-2 rounded-xl text-xs font-medium transition-all shrink-0 border ${
              isOOC
                ? 'bg-slate-600/50 text-slate-200 border-slate-500/50'
                : 'bg-transparent text-slate-500 hover:text-slate-300 border-slate-700/50 hover:border-slate-600'
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
              !isConnected
                ? '서버에 연결 중...'
                : isOOC
                  ? 'OOC 메시지...'
                  : '행동을 입력하세요...'
            }
            disabled={!isConnected}
            className="input-field flex-1"
          />
          <button
            type="submit"
            disabled={!isConnected || !input.trim()}
            className="btn-primary shrink-0 disabled:opacity-30 flex items-center gap-1"
          >
            <Send size={14} />
            <span className="hidden sm:inline">전송</span>
          </button>
        </form>
      </div>
    </div>
  );
}
