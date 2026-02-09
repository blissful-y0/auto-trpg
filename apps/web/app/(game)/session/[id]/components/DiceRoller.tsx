'use client';

import { useState } from 'react';

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

export default function DiceRoller() {
  const [selectedDice, setSelectedDice] = useState(20);
  const [count, setCount] = useState(1);
  const [modifier, setModifier] = useState(0);
  const [advantage, setAdvantage] = useState<'normal' | 'advantage' | 'disadvantage'>('normal');
  const [results, setResults] = useState<DiceResult[]>([]);

  const rollDice = () => {
    let rolls: number[] = [];
    const actualCount =
      advantage !== 'normal' && selectedDice === 20 ? 2 : count;

    for (let i = 0; i < actualCount; i++) {
      rolls.push(Math.floor(Math.random() * selectedDice) + 1);
    }

    let finalRolls = rolls;
    if (advantage === 'advantage' && selectedDice === 20) {
      finalRolls = [Math.max(...rolls)];
    } else if (advantage === 'disadvantage' && selectedDice === 20) {
      finalRolls = [Math.min(...rolls)];
    }

    const total =
      finalRolls.reduce((sum, r) => sum + r, 0) + modifier;

    const result: DiceResult = {
      notation: `${count}d${selectedDice}${modifier !== 0 ? (modifier > 0 ? `+${modifier}` : modifier.toString()) : ''}`,
      rolls,
      total,
      timestamp: new Date().toLocaleTimeString('ko-KR', {
        hour: '2-digit',
        minute: '2-digit',
      }),
    };

    setResults((prev) => [result, ...prev].slice(0, 10));
  };

  return (
    <div className="p-4 space-y-4">
      {/* 주사위 타입 선택 */}
      <div>
        <h4 className="text-sm font-medium text-slate-300 mb-2">주사위 선택</h4>
        <div className="grid grid-cols-4 gap-2">
          {diceTypes.map((dice) => (
            <button
              key={dice.sides}
              onClick={() => setSelectedDice(dice.sides)}
              className={`p-2 rounded-lg text-sm font-medium transition-colors ${
                selectedDice === dice.sides
                  ? 'bg-primary-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
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
          <label className="block text-xs text-slate-400 mb-1">개수</label>
          <input
            type="number"
            min={1}
            max={10}
            value={count}
            onChange={(e) => setCount(parseInt(e.target.value) || 1)}
            className="input-field text-center"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">수정치</label>
          <input
            type="number"
            value={modifier}
            onChange={(e) => setModifier(parseInt(e.target.value) || 0)}
            className="input-field text-center"
          />
        </div>
      </div>

      {/* 이점/불리 토글 (d20 전용) */}
      {selectedDice === 20 && (
        <div>
          <label className="block text-xs text-slate-400 mb-1">
            이점/불리
          </label>
          <div className="grid grid-cols-3 gap-1">
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
                className={`py-1.5 rounded text-xs font-medium transition-colors ${
                  advantage === opt.key
                    ? 'bg-primary-600 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
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
        className="btn-primary w-full text-lg py-3 glow-amber"
      >
        🎲 {count}d{selectedDice}
        {modifier !== 0 ? (modifier > 0 ? `+${modifier}` : modifier) : ''} 굴리기
      </button>

      {/* 결과 목록 */}
      {results.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-slate-300 mb-2">결과</h4>
          <div className="space-y-2">
            {results.map((result, i) => (
              <div
                key={i}
                className={`flex items-center justify-between p-2 rounded-lg ${
                  i === 0
                    ? 'bg-amber-900/30 border border-amber-700/30'
                    : 'bg-slate-700/30'
                }`}
              >
                <div>
                  <span className="text-sm text-slate-300">
                    {result.notation}
                  </span>
                  <span className="text-xs text-slate-500 ml-2">
                    [{result.rolls.join(', ')}]
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`font-bold ${
                      i === 0 ? 'text-amber-400 text-lg' : 'text-slate-300'
                    }`}
                  >
                    {result.total}
                  </span>
                  <span className="text-xs text-slate-500">
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
