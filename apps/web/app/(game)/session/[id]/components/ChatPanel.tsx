'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
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
  Dices,
} from 'lucide-react';
import Link from 'next/link';

// 메시지 타입
type MessageType = 'player' | 'gm' | 'system' | 'ooc' | 'dice';

interface Props {
  sessionId: string;
  sessionName?: string;
  gameSystem?: string;
  onLoadOlder?: () => Promise<void>;
  hasMoreMessages?: boolean;
  loadingOlder?: boolean;
}

export default function ChatPanel({ sessionId, sessionName, gameSystem, onLoadOlder, hasMoreMessages, loadingOlder }: Props) {
  const { messages, isStreaming, streamingContent } = useChatStore();
  const { status } = useSocketStore();
  const [input, setInput] = useState('');
  const [isOOC, setIsOOC] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isLoadingOlderRef = useRef(false);

  // 새 메시지 도착 시에만 스크롤 (이전 메시지 로드 시에는 유지)
  useEffect(() => {
    if (isLoadingOlderRef.current) return;
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  // 이전 메시지 로드 후 스크롤 위치 복원
  const handleLoadOlder = useCallback(async () => {
    if (!onLoadOlder || !scrollContainerRef.current) return;

    const container = scrollContainerRef.current;
    const prevScrollHeight = container.scrollHeight;
    isLoadingOlderRef.current = true;

    await onLoadOlder();

    // DOM 업데이트 후 스크롤 위치 복원
    requestAnimationFrame(() => {
      const newScrollHeight = container.scrollHeight;
      container.scrollTop = newScrollHeight - prevScrollHeight;
      isLoadingOlderRef.current = false;
    });
  }, [onLoadOlder]);

  // 스크롤 최상단 감지
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || !onLoadOlder) return;

    const handleScroll = () => {
      if (container.scrollTop < 100 && hasMoreMessages && !loadingOlder) {
        void handleLoadOlder();
      }
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [onLoadOlder, hasMoreMessages, loadingOlder, handleLoadOlder]);

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

    // IC 메시지일 때 GM 응답 대기 표시
    if (!isOOC) {
      useChatStore.getState().startStreaming();
    }

    setInput('');
  };

  const getMessageStyle = (type: MessageType) => {
    switch (type) {
      case 'gm':
        return 'gm-message rounded-lg p-4 my-1.5';
      case 'system':
        return 'system-message text-center py-2';
      case 'ooc':
        return 'ooc-message p-2.5 my-1 rounded-lg bg-bg-overlay';
      case 'dice':
        return 'bg-bg-overlay rounded-lg p-3 my-1 border border-line';
      default:
        return 'p-3 my-1 rounded-lg bg-bg-surface border border-line-subtle';
    }
  };

  const isConnected = status === 'connected';

  return (
    <div className="flex flex-col h-full">
      {/* 세션 헤더 */}
      <div className="px-4 py-3 border-b border-line bg-bg-surface backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-colors"
              title="대시보드로 돌아가기"
            >
              <ArrowLeft size={18} />
            </Link>
            <div>
              <h2 className="font-semibold text-text-primary text-sm">
                {sessionName || '게임 세션'}
              </h2>
              {gameSystem && (
                <p className="text-xs text-text-tertiary">{gameSystem}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {isConnected ? (
              <Wifi size={14} className="text-success" />
            ) : (
              <WifiOff size={14} className="text-danger" />
            )}
            <span className={`text-xs ${isConnected ? 'text-success' : 'text-danger'}`}>
              {isConnected ? '연결됨' : status === 'connecting' ? '연결 중...' : '연결 끊김'}
            </span>
          </div>
        </div>
      </div>

      {/* 메시지 목록 */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
        {/* 이전 메시지 로드 인디케이터 */}
        {loadingOlder && (
          <div className="flex items-center justify-center gap-1.5 py-2">
            <Loader2 size={14} className="animate-spin text-text-tertiary" />
            <span className="text-xs text-text-tertiary">이전 메시지 불러오는 중...</span>
          </div>
        )}
        {!hasMoreMessages && messages.length > 0 && (
          <div className="text-center py-2">
            <span className="text-xs text-text-tertiary">대화의 시작입니다</span>
          </div>
        )}

        {messages.length === 0 && !isStreaming && (
          <div className="flex flex-col items-center text-center py-16">
            <MessageCircle size={32} className="text-text-tertiary mb-3" />
            <p className="text-text-tertiary text-sm">아직 메시지가 없습니다</p>
            <p className="text-text-tertiary text-xs mt-1">행동을 입력하여 모험을 시작하세요</p>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={getMessageStyle(msg.type)}>
            {msg.type !== 'system' && (
              <div className="flex items-center gap-2 mb-1">
                <span
                  className={`text-xs font-semibold ${
                    msg.type === 'gm' ? 'text-gold' : 'text-text-primary'
                  }`}
                >
                  {msg.sender}
                </span>
                {msg.type === 'ooc' && (
                  <span className="text-[10px] text-text-tertiary bg-bg-overlay px-1.5 py-0.5 rounded">OOC</span>
                )}
                <span className="text-[10px] text-text-tertiary">{msg.timestamp}</span>
              </div>
            )}

            <p className={`text-sm leading-relaxed whitespace-pre-wrap ${msg.type === 'gm' ? 'font-serif' : ''}`}>{msg.content}</p>

            {/* 주사위 결과 인라인 표시 */}
            {msg.diceResult && (
              <div className="mt-2 flex items-center gap-2 text-sm">
                <span className="text-text-secondary font-mono">{msg.diceResult.notation}</span>
                <span className="text-text-tertiary font-mono">
                  [{msg.diceResult.rolls.join(', ')}]
                </span>
                {msg.diceResult.modifier !== 0 && (
                  <span className="text-text-tertiary font-mono">
                    {msg.diceResult.modifier > 0 ? '+' : ''}
                    {msg.diceResult.modifier}
                  </span>
                )}
                <span className="font-bold text-gold font-mono">
                  = {msg.diceResult.total}
                </span>
              </div>
            )}

            {/* GM 주사위 제안 버튼 */}
            {msg.diceRequests && msg.diceRequests.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {msg.diceRequests.map((req, idx) => (
                  <button
                    key={`${msg.id}-dice-${idx}`}
                    onClick={() => {
                      const socket = getSocket();
                      if (!socket || status !== 'connected') return;
                      const match = req.notation.match(/^(\d*)d(\d+)([+-]\d+)?$/i);
                      if (!match) return;
                      socket.emit('dice:roll', {
                        sessionId,
                        dice: `d${match[2]}`,
                        count: match[1] ? parseInt(match[1], 10) : 1,
                        modifier: match[3] ? parseInt(match[3], 10) : 0,
                        reason: req.purpose,
                      });
                      // 주사위 결과 기반 GM 응답 대기 표시
                      useChatStore.getState().startStreaming();
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gold/40 bg-gold/10 hover:bg-gold/20 text-gold text-xs font-medium transition-colors"
                  >
                    <Dices size={14} />
                    <span>{req.notation}</span>
                    <span className="text-text-tertiary">({req.purpose}{req.dc ? ` DC${req.dc}` : ''})</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}

        {/* GM 스트리밍 표시 */}
        {isStreaming && (
          <div className="gm-message rounded-lg p-4 my-1.5">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold text-gold">GM</span>
            </div>
            {streamingContent ? (
              <p className="text-sm leading-relaxed whitespace-pre-wrap font-serif">{streamingContent}</p>
            ) : (
              <div className="flex items-center gap-1.5 py-1">
                <Loader2 size={14} className="animate-spin text-gold" />
                <span className="text-xs text-gold/70">GM이 생각하는 중...</span>
              </div>
            )}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 입력창 */}
      <div className="px-4 py-3 border-t border-line bg-bg-surface backdrop-blur-sm">
        <form onSubmit={handleSend} className="flex gap-2">
          <button
            type="button"
            onClick={() => setIsOOC(!isOOC)}
            className={`px-3 py-2 rounded-xl text-xs font-medium transition-all shrink-0 border ${
              isOOC
                ? 'bg-bg-overlay text-text-primary border-line-strong'
                : 'bg-transparent text-text-tertiary hover:text-text-secondary border-line hover:border-line-strong'
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
