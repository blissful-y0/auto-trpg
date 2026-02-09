'use client';

// Mock 이야기 로그 데이터
const mockNarrative = [
  {
    id: '1',
    chapter: '프롤로그',
    entries: [
      {
        timestamp: '14:00',
        content:
          '모험자들이 팬달린 마을로 향하는 여정을 시작했다. 건드워르의 광산 물자를 운반하는 임무를 맡은 일행은 먼지 낀 도로를 따라 걷고 있었다.',
      },
      {
        timestamp: '14:03',
        content:
          '아라곤의 예리한 감지로 고블린의 매복을 발견했다. 길 위에 죽은 말 두 마리와 고블린 화살이 흩어져 있었다.',
      },
    ],
  },
  {
    id: '2',
    chapter: '첫 번째 전투',
    entries: [
      {
        timestamp: '14:04',
        content:
          '고블린 네 마리가 수풀 속에서 뛰쳐나왔다! 전투가 시작되었다.',
      },
      {
        timestamp: '14:10',
        content:
          '치열한 전투 끝에 일행은 고블린들을 물리쳤다. 아라곤이 경미한 부상을 입었지만, 전투는 일행의 승리로 끝났다.',
      },
    ],
  },
];

export default function NarrativeLog() {
  return (
    <div className="p-4 space-y-6">
      <h4 className="text-sm font-medium text-slate-300">이야기 기록</h4>

      {mockNarrative.map((chapter) => (
        <div key={chapter.id}>
          <h5 className="text-xs font-medium text-amber-400 uppercase tracking-wider mb-3 pb-1 border-b border-slate-700">
            {chapter.chapter}
          </h5>
          <div className="space-y-3">
            {chapter.entries.map((entry, i) => (
              <div key={i} className="relative pl-4">
                {/* 타임라인 라인 */}
                <div className="absolute left-0 top-1.5 w-1.5 h-1.5 bg-amber-500/50 rounded-full" />
                {i < chapter.entries.length - 1 && (
                  <div className="absolute left-[2.5px] top-3 w-px h-full bg-slate-700" />
                )}
                <p className="text-sm text-slate-300 leading-relaxed">
                  {entry.content}
                </p>
                <span className="text-xs text-slate-500 mt-1 block">
                  {entry.timestamp}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}

      {mockNarrative.length === 0 && (
        <p className="text-sm text-slate-500 text-center py-8">
          아직 기록된 이야기가 없습니다
        </p>
      )}
    </div>
  );
}
