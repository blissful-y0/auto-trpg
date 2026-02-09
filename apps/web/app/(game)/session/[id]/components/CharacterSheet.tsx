'use client';

import { useGameStore } from '@/lib/stores/gameStore';

// 상태이상 한글 매핑
const CONDITION_NAMES: Record<string, string> = {
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

export default function CharacterSheet() {
  const { character } = useGameStore();

  // 캐릭터 데이터가 없으면 기본 안내 표시
  if (!character) {
    return (
      <div className="p-4 text-center">
        <p className="text-sm text-slate-500">캐릭터를 선택해주세요.</p>
      </div>
    );
  }

  const hpPercent = character.hp.max > 0 ? (character.hp.current / character.hp.max) * 100 : 0;
  const hpColor =
    hpPercent > 50
      ? 'bg-green-500'
      : hpPercent > 25
        ? 'bg-yellow-500'
        : 'bg-red-500';

  // 상태이상 (character에 conditions 필드가 있으면)
  const conditions: string[] = (character as { conditions?: string[] }).conditions ?? [];

  return (
    <div className="p-4 space-y-4">
      {/* 기본 정보 */}
      <div className="text-center pb-4 border-b border-slate-700">
        <h3 className="text-lg font-bold text-amber-400">{character.name}</h3>
        <p className="text-sm text-slate-400">
          {character.race} {character.class} (Lv.{character.level})
        </p>
      </div>

      {/* HP 바 */}
      <div>
        <div className="flex justify-between text-sm mb-1">
          <span className="text-slate-300">HP</span>
          <span className="text-slate-400">
            {character.hp.current}/{character.hp.max}
          </span>
        </div>
        <div className="hp-bar">
          <div
            className={`hp-bar-fill ${hpColor} transition-all duration-300`}
            style={{ width: `${hpPercent}%` }}
          />
        </div>
      </div>

      {/* 상태이상 */}
      {conditions.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-slate-300 mb-2">상태이상</h4>
          <div className="flex flex-wrap gap-1">
            {conditions.map((cond) => (
              <span
                key={cond}
                className="text-xs px-2 py-1 bg-purple-500/20 text-purple-400 rounded-lg border border-purple-500/30"
              >
                {CONDITION_NAMES[cond] ?? cond}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* AC */}
      <div className="flex items-center justify-between p-3 bg-slate-700/50 rounded-lg">
        <span className="text-sm text-slate-300">방어도 (AC)</span>
        <span className="text-xl font-bold text-slate-100">{character.ac}</span>
      </div>

      {/* 능력치 */}
      <div>
        <h4 className="text-sm font-medium text-slate-300 mb-2">능력치</h4>
        <div className="grid grid-cols-3 gap-2">
          {(
            Object.entries(character.abilities) as [
              string,
              { score: number; modifier: number },
            ][]
          ).map(([key, val]) => (
            <div
              key={key}
              className="text-center p-2 bg-slate-700/50 rounded-lg border border-slate-600"
            >
              <div className="text-xs text-slate-400 mb-1">{key}</div>
              <div className="text-lg font-bold text-slate-100">
                {val.score}
              </div>
              <div className="text-xs text-primary-400">
                {val.modifier >= 0 ? '+' : ''}
                {val.modifier}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 인벤토리 */}
      <div>
        <h4 className="text-sm font-medium text-slate-300 mb-2">인벤토리</h4>
        <ul className="space-y-1">
          {character.inventory.map((item, i) => (
            <li
              key={i}
              className="text-sm text-slate-400 flex items-center gap-2"
            >
              <span className="w-1.5 h-1.5 bg-slate-500 rounded-full shrink-0" />
              {item}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
