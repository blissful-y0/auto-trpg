'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useSocket } from '@/lib/hooks/useSocket';
import { useGameSocket } from '@/lib/hooks/useGameSocket';
import { useGameStore } from '@/lib/stores/gameStore';
import { useChatStore } from '@/lib/stores/chatStore';
import { sessionApi, chatApi } from '@/lib/api';
import ChatPanel from './components/ChatPanel';
import CharacterSheet from './components/CharacterSheet';
import DiceRoller from './components/DiceRoller';
import CombatTracker from './components/CombatTracker';
import NarrativeLog from './components/NarrativeLog';

type RightPanel = 'character' | 'dice' | 'combat' | 'narrative';

export default function GameSessionPage() {
  const params = useParams();
  const sessionId = params.id as string;

  // Supabase 세션에서 토큰 가져오기
  const [token, setToken] = useState<string | null>(null);
  const { setSession } = useGameStore();
  const { addMessage } = useChatStore();

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      setToken(session?.access_token ?? null);
    });
  }, []);

  // 소켓 연결 및 게임 이벤트 바인딩
  useSocket(sessionId, token);
  useGameSocket(sessionId);

  // 초기 데이터 로드
  useEffect(() => {
    if (!token) return;

    // 세션 정보 로드
    sessionApi.get(sessionId).then((res: any) => {
      if (res?.data) {
        setSession(res.data);
      }
    }).catch(console.error);

    // 메시지 히스토리 로드
    chatApi.getMessages(sessionId).then((res: any) => {
      const messages = res?.data || [];
      messages.forEach((msg: any) => {
        addMessage({
          id: msg.id || `hist-${Date.now()}-${Math.random()}`,
          type: msg.role === 'assistant' ? 'gm' : msg.message_type || 'player',
          sender: msg.role === 'assistant' ? 'GM' : msg.user_id || '플레이어',
          content: msg.content,
          timestamp: new Date(msg.created_at).toLocaleTimeString('ko-KR', {
            hour: '2-digit',
            minute: '2-digit',
          }),
        });
      });
    }).catch(console.error);
  }, [token, sessionId, setSession, addMessage]);

  const [rightPanel, setRightPanel] = useState<RightPanel>('character');
  const [showRightPanel, setShowRightPanel] = useState(true);

  const panelTabs: { key: RightPanel; label: string }[] = [
    { key: 'character', label: '캐릭터' },
    { key: 'dice', label: '주사위' },
    { key: 'combat', label: '전투' },
    { key: 'narrative', label: '이야기' },
  ];

  return (
    <div className="flex h-full">
      {/* 왼쪽: 채팅 패널 */}
      <div className="flex-1 flex flex-col min-w-0">
        <ChatPanel sessionId={sessionId} />
      </div>

      {/* 오른쪽 패널 토글 (모바일) */}
      <button
        onClick={() => setShowRightPanel(!showRightPanel)}
        className="md:hidden fixed bottom-4 right-4 z-50 w-12 h-12 bg-primary-600 rounded-full flex items-center justify-center shadow-lg"
      >
        {showRightPanel ? '✕' : '☰'}
      </button>

      {/* 오른쪽: 게임 정보 패널 */}
      <div
        className={`w-80 lg:w-96 border-l border-slate-700 bg-slate-800 flex flex-col
          ${showRightPanel ? 'block' : 'hidden'} md:block
          fixed md:static inset-y-0 right-0 z-40 md:z-auto`}
      >
        {/* 패널 탭 */}
        <div className="flex border-b border-slate-700">
          {panelTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setRightPanel(tab.key)}
              className={`flex-1 px-2 py-3 text-xs font-medium transition-colors ${
                rightPanel === tab.key
                  ? 'text-primary-400 border-b-2 border-primary-400'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* 패널 내용 */}
        <div className="flex-1 overflow-y-auto">
          {rightPanel === 'character' && <CharacterSheet />}
          {rightPanel === 'dice' && <DiceRoller sessionId={sessionId} />}
          {rightPanel === 'combat' && <CombatTracker />}
          {rightPanel === 'narrative' && <NarrativeLog />}
        </div>
      </div>
    </div>
  );
}
