'use client';

// Mock 전투 데이터
const mockCombatants = [
  {
    id: '1',
    name: '아라곤',
    initiative: 18,
    hp: { current: 24, max: 30 },
    ac: 15,
    isPlayer: true,
    isCurrentTurn: true,
  },
  {
    id: '2',
    name: '고블린 A',
    initiative: 15,
    hp: { current: 5, max: 7 },
    ac: 13,
    isPlayer: false,
    isCurrentTurn: false,
  },
  {
    id: '3',
    name: '레고라스',
    initiative: 14,
    hp: { current: 22, max: 22 },
    ac: 14,
    isPlayer: true,
    isCurrentTurn: false,
  },
  {
    id: '4',
    name: '고블린 B',
    initiative: 12,
    hp: { current: 0, max: 7 },
    ac: 13,
    isPlayer: false,
    isCurrentTurn: false,
  },
  {
    id: '5',
    name: '김리',
    initiative: 8,
    hp: { current: 30, max: 35 },
    ac: 17,
    isPlayer: true,
    isCurrentTurn: false,
  },
];

export default function CombatTracker() {
  const round = 2;
  const combatants = mockCombatants;

  return (
    <div className="p-4 space-y-4">
      {/* 라운드 카운터 */}
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-slate-300">전투 트래커</h4>
        <span className="text-xs px-2 py-1 bg-red-500/20 text-red-400 rounded-full">
          라운드 {round}
        </span>
      </div>

      {/* 이니셔티브 순서 */}
      <div className="space-y-1">
        {combatants.map((c) => {
          const isDead = c.hp.current <= 0;
          const hpPercent = (c.hp.current / c.hp.max) * 100;
          const hpColor =
            hpPercent > 50
              ? 'bg-green-500'
              : hpPercent > 25
                ? 'bg-yellow-500'
                : 'bg-red-500';

          return (
            <div
              key={c.id}
              className={`flex items-center gap-3 p-2 rounded-lg transition-colors ${
                c.isCurrentTurn
                  ? 'bg-amber-900/30 border border-amber-700/50'
                  : isDead
                    ? 'opacity-40'
                    : 'bg-slate-700/30'
              }`}
            >
              {/* 현재 턴 표시 */}
              <div className="w-5 text-center">
                {c.isCurrentTurn && (
                  <span className="text-amber-400 text-sm">▶</span>
                )}
              </div>

              {/* 이니셔티브 */}
              <span className="text-xs text-slate-500 w-6 text-center">
                {c.initiative}
              </span>

              {/* 이름 */}
              <div className="flex-1 min-w-0">
                <span
                  className={`text-sm ${
                    c.isPlayer ? 'text-primary-400' : 'text-red-400'
                  } ${isDead ? 'line-through' : ''}`}
                >
                  {c.name}
                </span>
              </div>

              {/* HP 미니 바 */}
              <div className="w-20">
                <div className="h-1.5 rounded-full bg-slate-600 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${isDead ? 'bg-slate-500' : hpColor}`}
                    style={{ width: `${Math.max(hpPercent, 0)}%` }}
                  />
                </div>
                <div className="text-xs text-slate-500 text-center mt-0.5">
                  {c.hp.current}/{c.hp.max}
                </div>
              </div>

              {/* AC */}
              <span className="text-xs text-slate-500 w-8 text-center">
                AC {c.ac}
              </span>
            </div>
          );
        })}
      </div>

      {/* Phase 2 연동 안내 */}
      <p className="text-xs text-slate-500 text-center">
        전투 자동화는 Phase 2에서 지원됩니다
      </p>
    </div>
  );
}
