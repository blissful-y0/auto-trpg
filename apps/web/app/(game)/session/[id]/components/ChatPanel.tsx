'use client';

import { useState, useRef, useEffect } from 'react';

// 메시지 타입
type MessageType = 'player' | 'gm' | 'system' | 'ooc' | 'dice';

interface ChatMessage {
  id: string;
  type: MessageType;
  sender: string;
  content: string;
  timestamp: string;
  diceResult?: {
    notation: string;
    rolls: number[];
    total: number;
    modifier: number;
  };
}

// Mock 메시지 데이터
const mockMessages: ChatMessage[] = [
  {
    id: '1',
    type: 'system',
    sender: '시스템',
    content: '세션이 시작되었습니다. 잃어버린 광산의 판델버에 오신 것을 환영합니다.',
    timestamp: '14:00',
  },
  {
    id: '2',
    type: 'gm',
    sender: 'GM',
    content:
      '여러분은 팬달린 마을로 향하는 먼지 낀 도로를 따라 걷고 있습니다. 건드워르의 광산 물자를 실은 수레가 덜컹거리며 뒤따릅니다. 오후의 햇살이 나무 사이로 비추고 있지만, 길 앞쪽에서 이상한 정적이 흐르고 있습니다...',
    timestamp: '14:01',
  },
  {
    id: '3',
    type: 'player',
    sender: '아라곤',
    content: '주변을 살펴봅니다. 수상한 점이 있나요? 감지 체크를 하겠습니다.',
    timestamp: '14:02',
  },
  {
    id: '4',
    type: 'dice',
    sender: '아라곤',
    content: '감지(Perception) 체크',
    timestamp: '14:02',
    diceResult: {
      notation: '1d20+3',
      rolls: [14],
      total: 17,
      modifier: 3,
    },
  },
  {
    id: '5',
    type: 'gm',
    sender: 'GM',
    content:
      '아라곤, 당신의 예리한 눈이 길 양쪽의 수풀 속에서 무언가를 포착합니다. 죽은 말 두 마리가 길 위에 쓰러져 있고, 그 주변에 검은 깃털 달린 화살이 여러 개 박혀 있습니다. 고블린의 매복입니다!',
    timestamp: '14:03',
  },
  {
    id: '6',
    type: 'ooc',
    sender: '아라곤',
    content: '전투 시작인가요? 이니셔티브 굴려야 하나요?',
    timestamp: '14:03',
  },
  {
    id: '7',
    type: 'system',
    sender: '시스템',
    content: '전투가 시작됩니다! 모든 플레이어는 이니셔티브를 굴려주세요.',
    timestamp: '14:04',
  },
];

export default function ChatPanel() {
  const [messages] = useState<ChatMessage[]>(mockMessages);
  const [input, setInput] = useState('');
  const [isOOC, setIsOOC] = useState(false);
  const [isStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    // TODO: 메시지 전송 로직
    console.log('메시지 전송:', { content: input, isOOC });
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

  return (
    <div className="flex flex-col h-full">
      {/* 세션 헤더 */}
      <div className="px-4 py-3 border-b border-slate-700 bg-slate-800">
        <h2 className="font-semibold text-slate-100">
          잃어버린 광산의 판델버
        </h2>
        <p className="text-xs text-slate-400">D&D 5e · 플레이어 3/4</p>
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
                <span className="text-slate-400">🎲 {msg.diceResult.notation}</span>
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
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 bg-amber-400 rounded-full animate-pulse" />
              <span className="w-2 h-2 bg-amber-400 rounded-full animate-pulse delay-100" />
              <span className="w-2 h-2 bg-amber-400 rounded-full animate-pulse delay-200" />
            </div>
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
            placeholder={isOOC ? 'OOC 메시지...' : '행동을 입력하세요...'}
            className="input-field flex-1"
          />
          <button type="submit" className="btn-primary shrink-0">
            전송
          </button>
        </form>
      </div>
    </div>
  );
}
