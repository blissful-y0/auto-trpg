'use client';

import { useGameStore } from '@/lib/stores/gameStore';
import { User, Shield, Heart, Sword, Backpack } from 'lucide-react';

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

  if (!character) {
    return (
      <div className="flex flex-col items-center text-center p-6 py-10">
        <User size={28} className="text-text-tertiary mb-3" />
        <p className="text-sm text-text-tertiary">캐릭터를 선택해주세요</p>
        <p className="text-xs text-text-tertiary mt-1">
          세션에 참가하면 캐릭터 정보가 표시됩니다
        </p>
      </div>
    );
  }

  const hpPercent = character.hp.max > 0 ? (character.hp.current / character.hp.max) * 100 : 0;
  const hpColor =
    hpPercent > 50
      ? 'bg-success'
      : hpPercent > 25
        ? 'bg-warning'
        : 'bg-danger';

  const conditions: string[] = (character as { conditions?: string[] }).conditions ?? [];

  return (
    <div className="p-4 space-y-4">
      {/* 기본 정보 */}
      <div className="text-center pb-4 border-b border-line">
        <h3 className="text-lg font-bold text-gold font-serif">{character.name}</h3>
        <p className="text-sm text-text-secondary">
          {character.race} {character.class} (Lv.{character.level})
        </p>
      </div>

      {/* HP 바 */}
      <div className="p-3 bg-bg-overlay rounded-xl">
        <div className="flex items-center justify-between text-sm mb-2">
          <span className="text-text-secondary flex items-center gap-1.5">
            <Heart size={14} className="text-danger" />
            HP
          </span>
          <span className="text-text-secondary font-medium">
            {character.hp.current}/{character.hp.max}
          </span>
        </div>
        <div className="hp-bar">
          <div
            className={`hp-bar-fill ${hpColor}`}
            style={{ width: `${hpPercent}%` }}
          />
        </div>
      </div>

      {/* 상태이상 */}
      {conditions.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-text-secondary mb-2 uppercase tracking-wider">상태이상</h4>
          <div className="flex flex-wrap gap-1.5">
            {conditions.map((cond) => (
              <span
                key={cond}
                className="text-xs px-2 py-1 bg-purple/15 text-purple rounded-lg"
              >
                {CONDITION_NAMES[cond] ?? cond}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* AC */}
      <div className="flex items-center justify-between p-3 bg-bg-overlay rounded-xl">
        <span className="text-sm text-text-secondary flex items-center gap-1.5">
          <Shield size={14} className="text-info" />
          방어도 (AC)
        </span>
        <span className="text-xl font-bold text-text-primary">{character.ac}</span>
      </div>

      {/* 능력치 */}
      <div>
        <h4 className="text-xs font-medium text-text-secondary mb-2 uppercase tracking-wider flex items-center gap-1.5">
          <Sword size={12} />
          능력치
        </h4>
        <div className="grid grid-cols-3 gap-1.5">
          {(
            Object.entries(character.abilities) as [
              string,
              { score: number; modifier: number },
            ][]
          ).map(([key, val]) => (
            <div
              key={key}
              className="text-center p-2.5 bg-bg-overlay rounded-xl border border-line"
            >
              <div className="text-[10px] text-text-tertiary mb-0.5 uppercase">{key}</div>
              <div className="text-base font-bold text-text-primary">
                {val.score}
              </div>
              <div className="text-xs text-gold font-medium">
                {val.modifier >= 0 ? '+' : ''}
                {val.modifier}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 인벤토리 */}
      {character.inventory.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-text-secondary mb-2 uppercase tracking-wider flex items-center gap-1.5">
            <Backpack size={12} />
            인벤토리
          </h4>
          <ul className="space-y-1">
            {character.inventory.map((item, i) => (
              <li
                key={i}
                className="text-sm text-text-secondary flex items-center gap-2 py-0.5"
              >
                <span className="w-1 h-1 bg-text-tertiary rounded-full shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
