'use client';

// Mock 캐릭터 데이터
const mockCharacter = {
  name: '아라곤',
  race: '인간',
  class: '레인저',
  level: 3,
  hp: { current: 24, max: 30 },
  ac: 15,
  abilities: {
    STR: { score: 14, modifier: 2 },
    DEX: { score: 16, modifier: 3 },
    CON: { score: 13, modifier: 1 },
    INT: { score: 10, modifier: 0 },
    WIS: { score: 15, modifier: 2 },
    CHA: { score: 11, modifier: 0 },
  },
  inventory: [
    '롱소드',
    '숏보우 (화살 20개)',
    '가죽 갑옷',
    '탐험가 배낭',
    '밧줄 (50ft)',
    '치료 포션 x2',
  ],
};

export default function CharacterSheet() {
  const char = mockCharacter;
  const hpPercent = (char.hp.current / char.hp.max) * 100;
  const hpColor =
    hpPercent > 50
      ? 'bg-green-500'
      : hpPercent > 25
        ? 'bg-yellow-500'
        : 'bg-red-500';

  return (
    <div className="p-4 space-y-4">
      {/* 기본 정보 */}
      <div className="text-center pb-4 border-b border-slate-700">
        <h3 className="text-lg font-bold text-amber-400">{char.name}</h3>
        <p className="text-sm text-slate-400">
          {char.race} {char.class} (Lv.{char.level})
        </p>
      </div>

      {/* HP 바 */}
      <div>
        <div className="flex justify-between text-sm mb-1">
          <span className="text-slate-300">HP</span>
          <span className="text-slate-400">
            {char.hp.current}/{char.hp.max}
          </span>
        </div>
        <div className="hp-bar">
          <div
            className={`hp-bar-fill ${hpColor}`}
            style={{ width: `${hpPercent}%` }}
          />
        </div>
      </div>

      {/* AC */}
      <div className="flex items-center justify-between p-3 bg-slate-700/50 rounded-lg">
        <span className="text-sm text-slate-300">방어도 (AC)</span>
        <span className="text-xl font-bold text-slate-100">{char.ac}</span>
      </div>

      {/* 능력치 */}
      <div>
        <h4 className="text-sm font-medium text-slate-300 mb-2">능력치</h4>
        <div className="grid grid-cols-3 gap-2">
          {(
            Object.entries(char.abilities) as [
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
          {char.inventory.map((item, i) => (
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
