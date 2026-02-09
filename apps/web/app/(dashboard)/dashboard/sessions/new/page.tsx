'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { sessionApi } from '@/lib/api';

const gameSystems = [
  { id: 'dnd5e', name: 'D&D 5th Edition' },
  { id: 'pathfinder2e', name: 'Pathfinder 2e' },
  { id: 'coc7e', name: 'Call of Cthulhu 7e' },
  { id: 'starfinder', name: 'Starfinder' },
  { id: 'custom', name: '커스텀 시스템' },
];

const llmProviders = [
  { id: 'openai', name: 'OpenAI (GPT-4)' },
  { id: 'anthropic', name: 'Anthropic (Claude)' },
  { id: 'google', name: 'Google (Gemini)' },
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
    setIsLoading(true);
    try {
      const res = await sessionApi.create({
        name: formData.name,
        gameSystem: formData.system,
        maxPlayers: formData.maxPlayers,
        primaryProvider: providerMapping[formData.provider],
        gmAggressiveness: aggressivenessMapping[formData.gmAggressiveness],
      }) as any;
      router.push(`/session/${res.data.id}`);
    } catch (err: any) {
      alert(err.message || '세션 생성에 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold text-slate-100 mb-2">새 세션 만들기</h2>
      <p className="text-slate-400 mb-8">새로운 TRPG 모험을 시작하세요</p>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* 세션 이름 */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
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

        {/* 게임 시스템 */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
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

        {/* 최대 인원 */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            최대 플레이어 수
          </label>
          <input
            type="number"
            min={1}
            max={8}
            value={formData.maxPlayers}
            onChange={(e) =>
              setFormData({ ...formData, maxPlayers: parseInt(e.target.value) })
            }
            className="input-field w-32"
          />
        </div>

        {/* 규칙서 선택 */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            규칙서 (선택사항)
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
          <p className="text-xs text-slate-500 mt-1">
            업로드된 규칙서를 선택하면 AI GM이 해당 규칙을 참고합니다
          </p>
        </div>

        {/* LLM 프로바이더 */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            AI 프로바이더
          </label>
          <div className="grid grid-cols-3 gap-3">
            {llmProviders.map((provider) => (
              <button
                key={provider.id}
                type="button"
                onClick={() =>
                  setFormData({ ...formData, provider: provider.id })
                }
                className={`p-3 rounded-lg border text-sm text-center transition-colors ${
                  formData.provider === provider.id
                    ? 'border-primary-500 bg-primary-600/20 text-primary-400'
                    : 'border-slate-600 bg-slate-700 text-slate-300 hover:border-slate-500'
                }`}
              >
                {provider.name}
              </button>
            ))}
          </div>
        </div>

        {/* GM 적극성 */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            GM 적극성
          </label>
          <div className="space-y-2">
            {gmAggressivenessOptions.map((level) => (
              <label
                key={level.value}
                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  formData.gmAggressiveness === level.value
                    ? 'border-primary-500 bg-primary-600/20'
                    : 'border-slate-600 bg-slate-700 hover:border-slate-500'
                }`}
              >
                <input
                  type="radio"
                  name="aggressiveness"
                  value={level.value}
                  checked={formData.gmAggressiveness === level.value}
                  onChange={() =>
                    setFormData({
                      ...formData,
                      gmAggressiveness: level.value,
                    })
                  }
                  className="sr-only"
                />
                <span className="text-sm font-medium text-slate-200">
                  {level.label}
                </span>
                <span className="text-xs text-slate-400">{level.desc}</span>
              </label>
            ))}
          </div>
        </div>

        {/* 제출 버튼 */}
        <div className="flex gap-3 pt-4">
          <button
            type="submit"
            disabled={isLoading}
            className="btn-primary flex-1 disabled:opacity-50"
          >
            {isLoading ? '생성 중...' : '세션 생성'}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="btn-secondary"
            disabled={isLoading}
          >
            취소
          </button>
        </div>
      </form>
    </div>
  );
}
