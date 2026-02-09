'use client';

import { useState } from 'react';
import ChatPanel from './components/ChatPanel';
import CharacterSheet from './components/CharacterSheet';
import DiceRoller from './components/DiceRoller';
import CombatTracker from './components/CombatTracker';
import NarrativeLog from './components/NarrativeLog';

type RightPanel = 'character' | 'dice' | 'combat' | 'narrative';

export default function GameSessionPage() {
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
        <ChatPanel />
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
          {rightPanel === 'dice' && <DiceRoller />}
          {rightPanel === 'combat' && <CombatTracker />}
          {rightPanel === 'narrative' && <NarrativeLog />}
        </div>
      </div>
    </div>
  );
}
