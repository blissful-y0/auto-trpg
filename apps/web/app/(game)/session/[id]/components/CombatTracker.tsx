'use client';

import { useGameStore } from '@/lib/stores/gameStore';

// 상태이상 한글 매핑
const CONDITION_ICONS: Record<string, string> = {
  blinded: '실명',
  charmed: '매혹',
  deafened: '청각상실',
  exhaustion: '피로',
  frightened: '공포',
  grappled: '잡기',
  incapacitated: '무력화',
  invisible: '투명',
  paralyzed: '마비',
  petrified: '석화',
  poisoned: '중독',
  prone: '엎드림',
  restrained: '속박',
  stunned: '기절',
  unconscious: '의식불명',
};

export default function CombatTracker() {
  const { isInCombat, combatants, currentRound } = useGameStore();

  if (!isInCombat || combatants.length === 0) {
    return (
      <div className="p-4 text-center">
        <p className="text-sm text-slate-500">현재 전투 중이 아닙니다.</p>
        <p className="text-xs text-slate-600 mt-1">
          전투가 시작되면 여기에 표시됩니다.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* 라운드 카운터 */}
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-slate-300">전투 트래커</h4>
        <span className="text-xs px-2 py-1 bg-red-500/20 text-red-400 rounded-full">
          라운드 {currentRound}
        </span>
      </div>

      {/* 이니셔티브 순서 */}
      <div className="space-y-1">
        {combatants.map((c) => {
          const isDead = c.hp.current <= 0;
          const hpPercent = c.hp.max > 0 ? (c.hp.current / c.hp.max) * 100 : 0;
          const hpColor =
            hpPercent > 50
              ? 'bg-green-500'
              : hpPercent > 25
                ? 'bg-yellow-500'
                : 'bg-red-500';

          // 상태이상 태그 (conditions가 있는 경우)
          const conditions = (c as { conditions?: string[] }).conditions ?? [];

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

              {/* 이름 + 상태이상 */}
              <div className="flex-1 min-w-0">
                <span
                  className={`text-sm ${
                    c.isPlayer ? 'text-primary-400' : 'text-red-400'
                  } ${isDead ? 'line-through' : ''}`}
                >
                  {c.name}
                </span>

                {/* 상태이상 태그 */}
                {conditions.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {conditions.map((cond: string) => (
                      <span
                        key={cond}
                        className="text-[10px] px-1 py-0.5 bg-purple-500/20 text-purple-400 rounded"
                        title={CONDITION_ICONS[cond] ?? cond}
                      >
                        {CONDITION_ICONS[cond] ?? cond}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* HP 바 */}
              <div className="w-20">
                <div className="h-1.5 rounded-full bg-slate-600 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${isDead ? 'bg-slate-500' : hpColor}`}
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
    </div>
  );
}
