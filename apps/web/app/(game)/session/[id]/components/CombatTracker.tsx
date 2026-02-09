'use client';

import { useGameStore } from '@/lib/stores/gameStore';
import { Swords, Shield, Heart } from 'lucide-react';

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
      <div className="flex flex-col items-center text-center p-6 py-10">
        <Swords size={28} className="text-text-tertiary mb-3" />
        <p className="text-sm text-text-tertiary">현재 전투 중이 아닙니다</p>
        <p className="text-xs text-text-tertiary mt-1">
          전투가 시작되면 이니셔티브 순서가 표시됩니다
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* 라운드 카운터 */}
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-medium text-text-secondary uppercase tracking-wider">전투 트래커</h4>
        <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 bg-danger/15 text-danger rounded-full">
          <Swords size={12} />
          라운드 {currentRound}
        </span>
      </div>

      {/* 이니셔티브 순서 */}
      <div className="space-y-1.5">
        {combatants.map((c) => {
          const isDead = c.hp.current <= 0;
          const hpPercent = c.hp.max > 0 ? (c.hp.current / c.hp.max) * 100 : 0;
          const hpColor =
            hpPercent > 50
              ? 'bg-success'
              : hpPercent > 25
                ? 'bg-warning'
                : 'bg-danger';

          const conditions = (c as { conditions?: string[] }).conditions ?? [];

          return (
            <div
              key={c.id}
              className={`flex items-center gap-3 p-2.5 rounded-xl transition-all ${
                c.isCurrentTurn
                  ? 'bg-gold/10 border border-gold/20'
                  : isDead
                    ? 'opacity-40 bg-bg-overlay'
                    : 'bg-bg-overlay'
              }`}
            >
              {/* 현재 턴 표시 */}
              <div className="w-5 text-center shrink-0">
                {c.isCurrentTurn && (
                  <span className="text-gold text-sm">▶</span>
                )}
              </div>

              {/* 이니셔티브 */}
              <span className="text-xs text-text-tertiary w-6 text-center shrink-0 font-mono">
                {c.initiative}
              </span>

              {/* 이름 + 상태이상 */}
              <div className="flex-1 min-w-0">
                <span
                  className={`text-sm font-medium ${
                    c.isPlayer ? 'text-gold' : 'text-danger'
                  } ${isDead ? 'line-through' : ''}`}
                >
                  {c.name}
                </span>

                {conditions.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {conditions.map((cond: string) => (
                      <span
                        key={cond}
                        className="text-[10px] px-1 py-0.5 bg-purple/15 text-purple rounded"
                      >
                        {CONDITION_ICONS[cond] ?? cond}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* HP 바 */}
              <div className="w-20 shrink-0">
                <div className="h-1.5 rounded-full bg-bg-overlay overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${isDead ? 'bg-text-tertiary' : hpColor}`}
                    style={{ width: `${Math.max(hpPercent, 0)}%` }}
                  />
                </div>
                <div className="flex items-center justify-center gap-0.5 mt-0.5">
                  <Heart size={8} className="text-text-tertiary" />
                  <span className="text-[10px] text-text-tertiary">
                    {c.hp.current}/{c.hp.max}
                  </span>
                </div>
              </div>

              {/* AC */}
              <div className="flex items-center gap-0.5 shrink-0">
                <Shield size={10} className="text-text-tertiary" />
                <span className="text-xs text-text-tertiary">
                  {c.ac}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
