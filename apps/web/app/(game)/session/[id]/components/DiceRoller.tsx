'use client';

import { useState, useEffect } from 'react';
import { getSocket } from '@/lib/socket';
import { Dice5, Minus, Plus } from 'lucide-react';

const diceTypes = [
  { sides: 4, label: 'd4' },
  { sides: 6, label: 'd6' },
  { sides: 8, label: 'd8' },
  { sides: 10, label: 'd10' },
  { sides: 12, label: 'd12' },
  { sides: 20, label: 'd20' },
  { sides: 100, label: 'd100' },
];

interface DiceResult {
  notation: string;
  rolls: number[];
  total: number;
  timestamp: string;
}

export default function DiceRoller({ sessionId }: { sessionId: string }) {
  const [selectedDice, setSelectedDice] = useState(20);
  const [count, setCount] = useState(1);
  const [modifier, setModifier] = useState(0);
  const [advantage, setAdvantage] = useState<'normal' | 'advantage' | 'disadvantage'>('normal');
  const [results, setResults] = useState<DiceResult[]>([]);
  const [rolling, setRolling] = useState(false);

  // 서버에서 dice:result 이벤트 수신
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handleDiceResult = (payload: {
      sessionId: string;
      userId: string;
      dice: string;
      count: number;
      modifier: number;
      rolls: number[];
      total: number;
      reason: string;
    }) => {
      if (payload.sessionId !== sessionId) return;

      const result: DiceResult = {
        notation: `${payload.count}${payload.dice}${payload.modifier !== 0 ? (payload.modifier > 0 ? `+${payload.modifier}` : payload.modifier.toString()) : ''}`,
        rolls: payload.rolls,
        total: payload.total,
        timestamp: new Date().toLocaleTimeString('ko-KR', {
          hour: '2-digit',
          minute: '2-digit',
        }),
      };
      setResults((prev) => [result, ...prev].slice(0, 10));
      setRolling(false);
    };

    socket.on('dice:result', handleDiceResult);
    return () => {
      socket.off('dice:result', handleDiceResult);
    };
  }, [sessionId]);

  const rollDice = () => {
    const socket = getSocket();
    if (!socket) return;

    setRolling(true);

    const actualCount = advantage !== 'normal' && selectedDice === 20 ? 2 : count;

    socket.emit('dice:roll', {
      sessionId,
      dice: `d${selectedDice}`,
      count: actualCount,
      modifier,
      reason: advantage !== 'normal' ? `${advantage === 'advantage' ? '이점' : '불리'}` : '',
    });
  };

  return (
    <div className="p-4 space-y-4">
      {/* 주사위 타입 선택 */}
      <div>
        <h4 className="text-xs font-medium text-text-secondary mb-2 uppercase tracking-wider">주사위 선택</h4>
        <div className="grid grid-cols-4 gap-1.5">
          {diceTypes.map((dice) => (
            <button
              key={dice.sides}
              onClick={() => setSelectedDice(dice.sides)}
              className={`p-2 rounded-lg text-sm font-medium font-mono transition-all ${
                selectedDice === dice.sides
                  ? 'bg-gold/15 text-gold border border-gold'
                  : 'bg-bg-overlay text-text-secondary border border-line hover:border-line-strong hover:text-text-primary'
              }`}
            >
              {dice.label}
            </button>
          ))}
        </div>
      </div>

      {/* 개수 및 수정치 */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-text-tertiary mb-1.5">개수</label>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCount(Math.max(1, count - 1))}
              className="p-1.5 rounded-lg bg-bg-overlay text-text-secondary hover:text-text-primary transition-colors"
            >
              <Minus size={14} />
            </button>
            <input
              type="number"
              min={1}
              max={10}
              value={count}
              onChange={(e) => setCount(parseInt(e.target.value) || 1)}
              className="input-field text-center flex-1 font-mono"
            />
            <button
              onClick={() => setCount(Math.min(10, count + 1))}
              className="p-1.5 rounded-lg bg-bg-overlay text-text-secondary hover:text-text-primary transition-colors"
            >
              <Plus size={14} />
            </button>
          </div>
        </div>
        <div>
          <label className="block text-xs text-text-tertiary mb-1.5">수정치</label>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setModifier(modifier - 1)}
              className="p-1.5 rounded-lg bg-bg-overlay text-text-secondary hover:text-text-primary transition-colors"
            >
              <Minus size={14} />
            </button>
            <input
              type="number"
              value={modifier}
              onChange={(e) => setModifier(parseInt(e.target.value) || 0)}
              className="input-field text-center flex-1 font-mono"
            />
            <button
              onClick={() => setModifier(modifier + 1)}
              className="p-1.5 rounded-lg bg-bg-overlay text-text-secondary hover:text-text-primary transition-colors"
            >
              <Plus size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* 이점/불리 토글 (d20 전용) */}
      {selectedDice === 20 && (
        <div>
          <label className="block text-xs text-text-tertiary mb-1.5">
            이점/불리
          </label>
          <div className="grid grid-cols-3 gap-1.5">
            {(
              [
                { key: 'disadvantage', label: '불리' },
                { key: 'normal', label: '보통' },
                { key: 'advantage', label: '이점' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.key}
                onClick={() => setAdvantage(opt.key)}
                className={`py-2 rounded-lg text-xs font-medium transition-all ${
                  advantage === opt.key
                    ? 'bg-gold/15 text-gold border border-gold'
                    : 'bg-bg-overlay text-text-secondary border border-line hover:border-line-strong'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 굴리기 버튼 */}
      <button
        onClick={rollDice}
        disabled={rolling}
        className={`btn-primary w-full py-3 flex items-center justify-center gap-2 text-base font-mono ${
          rolling ? 'opacity-50 cursor-not-allowed' : 'shadow-glow'
        }`}
      >
        {rolling ? (
          <span className="animate-spin"><Dice5 size={20} /></span>
        ) : (
          <Dice5 size={20} />
        )}
        {rolling ? '굴리는 중...' : (
          <>
            {count}d{selectedDice}
            {modifier !== 0 ? (modifier > 0 ? `+${modifier}` : modifier) : ''} 굴리기
          </>
        )}
      </button>

      {/* 결과 목록 */}
      {results.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-text-secondary mb-2 uppercase tracking-wider">결과</h4>
          <div className="space-y-1.5">
            {results.map((result, i) => (
              <div
                key={i}
                className={`flex items-center justify-between p-2.5 rounded-xl transition-all ${
                  i === 0
                    ? 'bg-gold/10 border border-gold/20'
                    : 'bg-bg-overlay'
                }`}
              >
                <div>
                  <span className="text-sm text-text-primary font-medium font-mono">
                    {result.notation}
                  </span>
                  <span className="text-xs text-text-tertiary ml-2 font-mono">
                    [{result.rolls.join(', ')}]
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`font-bold font-mono ${
                      i === 0 ? 'text-gold text-lg' : 'text-text-primary'
                    }`}
                  >
                    {result.total}
                  </span>
                  <span className="text-[10px] text-text-tertiary">
                    {result.timestamp}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
