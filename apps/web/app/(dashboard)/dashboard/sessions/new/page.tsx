'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, ArrowLeft, Sparkles } from 'lucide-react';
import { sessionApi } from '@/lib/api';

const gameSystems = [
  { id: 'dnd5e', name: 'D&D 5th Edition' },
  { id: 'pathfinder2e', name: 'Pathfinder 2e' },
  { id: 'coc7e', name: 'Call of Cthulhu 7e' },
  { id: 'starfinder', name: 'Starfinder' },
  { id: 'custom', name: '커스텀 시스템' },
];

const llmProviders = [
  { id: 'anthropic', name: 'Anthropic (Claude)', desc: '고품질 내러티브', color: 'text-orange-400 border-orange-500/30 bg-orange-500/10' },
  { id: 'openai', name: 'OpenAI (GPT-4)', desc: '다목적 활용', color: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' },
  { id: 'google', name: 'Google (Gemini)', desc: '빠른 응답', color: 'text-blue-400 border-blue-500/30 bg-blue-500/10' },
];

const gmAggressivenessOptions = [
  { value: 1, label: '온건', desc: '플레이어에게 유리한 판정' },
  { value: 2, label: '보통', desc: '균형 잡힌 판정' },
  { value: 3, label: '도전적', desc: '규칙에 엄격한 판정' },
  { value: 4, label: '무자비', desc: '플레이어에게 불리한 판정' },
];

// 백엔드 프로바이더 이름 매핑
const providerMapping: Record<string, string> = {
  openai: 'openai',
  anthropic: 'claude',
  google: 'gemini',
};

// 백엔드 GM 적극성 매핑
const aggressivenessMapping: Record<number, string> = {
  1: 'passive',
  2: 'moderate',
  3: 'aggressive',
  4: 'aggressive',
};

export default function NewSessionPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    system: 'dnd5e',
    maxPlayers: 4,
    rulebook: '',
    provider: 'anthropic',
    gmAggressiveness: 2,
  });

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error('세션 이름을 입력해주세요');
      return;
    }
    setIsLoading(true);
    try {
      const res = await sessionApi.create({
        name: formData.name,
        gameSystem: formData.system,
        maxPlayers: formData.maxPlayers,
        primaryProvider: providerMapping[formData.provider],
        gmAggressiveness: aggressivenessMapping[formData.gmAggressiveness],
      }) as any;
      toast.success('세션이 생성되었습니다');
      router.push(`/session/${res.data.id}`);
    } catch (err: any) {
      toast.error(err.message || '세션 생성에 실패했습니다');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <button
        onClick={() => router.back()}
        className="flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200 mb-6 transition-colors"
      >
        <ArrowLeft size={16} />
        돌아가기
      </button>

      <div className="mb-8">
        <h2 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
          <Sparkles size={24} className="text-amber-400" />
          새 세션 만들기
        </h2>
        <p className="text-slate-400 mt-1 text-sm">새로운 TRPG 모험을 시작하세요</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* 세션 이름 */}
        <div className="card p-5">
          <label className="block text-sm font-medium text-slate-200 mb-2">
            세션 이름
          </label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) =>
              setFormData({ ...formData, name: e.target.value })
            }
            placeholder="예: 잃어버린 광산의 판델버"
            className="input-field"
            required
          />
        </div>

        {/* 게임 시스템 + 최대 인원 */}
        <div className="card p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-200 mb-2">
              게임 시스템
            </label>
            <select
              value={formData.system}
              onChange={(e) =>
                setFormData({ ...formData, system: e.target.value })
              }
              className="input-field"
            >
              {gameSystems.map((sys) => (
                <option key={sys.id} value={sys.id}>
                  {sys.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-200 mb-2">
              최대 플레이어 수
            </label>
            <input
              type="number"
              min={1}
              max={8}
              value={formData.maxPlayers}
              onChange={(e) =>
                setFormData({ ...formData, maxPlayers: parseInt(e.target.value) || 4 })
              }
              className="input-field w-32"
            />
          </div>

          {/* 규칙서 선택 */}
          <div>
            <label className="block text-sm font-medium text-slate-200 mb-2">
              규칙서
              <span className="text-slate-500 font-normal ml-1">(선택사항)</span>
            </label>
            <select
              value={formData.rulebook}
              onChange={(e) =>
                setFormData({ ...formData, rulebook: e.target.value })
              }
              className="input-field"
            >
              <option value="">규칙서 없이 시작</option>
              <option value="phb">Player&apos;s Handbook</option>
              <option value="dmg">Dungeon Master&apos;s Guide</option>
            </select>
            <p className="text-xs text-slate-500 mt-1.5">
              업로드된 규칙서를 선택하면 AI GM이 해당 규칙을 참고합니다
            </p>
          </div>
        </div>

        {/* LLM 프로바이더 */}
        <div className="card p-5">
          <label className="block text-sm font-medium text-slate-200 mb-3">
            AI 프로바이더
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {llmProviders.map((provider) => {
              const isSelected = formData.provider === provider.id;
              return (
                <button
                  key={provider.id}
                  type="button"
                  onClick={() =>
                    setFormData({ ...formData, provider: provider.id })
                  }
                  className={`p-3.5 rounded-xl border text-left transition-all ${
                    isSelected
                      ? `${provider.color} border-2`
                      : 'border-slate-700 bg-slate-700/30 text-slate-300 hover:border-slate-600'
                  }`}
                >
                  <span className="text-sm font-medium block">{provider.name}</span>
                  <span className="text-xs opacity-70 mt-0.5 block">{provider.desc}</span>
                </button>
              );
            })}
          </div>
          <p className="text-xs text-slate-500 mt-2">
            설정 페이지에서 해당 프로바이더의 API 키를 등록해야 합니다
          </p>
        </div>

        {/* GM 적극성 */}
        <div className="card p-5">
          <label className="block text-sm font-medium text-slate-200 mb-3">
            GM 적극성
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {gmAggressivenessOptions.map((level) => (
              <button
                key={level.value}
                type="button"
                onClick={() =>
                  setFormData({
                    ...formData,
                    gmAggressiveness: level.value,
                  })
                }
                className={`p-3 rounded-xl border text-center transition-all ${
                  formData.gmAggressiveness === level.value
                    ? 'border-primary-500 bg-primary-600/15 text-primary-400 border-2'
                    : 'border-slate-700 bg-slate-700/30 text-slate-300 hover:border-slate-600'
                }`}
              >
                <span className="text-sm font-medium block">{level.label}</span>
                <span className="text-xs text-slate-500 mt-0.5 block">{level.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 제출 버튼 */}
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={isLoading}
            className="btn-primary flex-1 py-3 disabled:opacity-50 flex items-center justify-center gap-2 text-base"
          >
            {isLoading ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                생성 중...
              </>
            ) : (
              <>
                <Sparkles size={18} />
                세션 생성
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
