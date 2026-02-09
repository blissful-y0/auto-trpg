'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, ArrowLeft, Sparkles } from 'lucide-react';
import { sessionApi, settingsApi } from '@/lib/api';

interface ProviderModel {
  id: string;
  label: string;
}

const gameSystems = [
  { id: 'dnd5e', name: 'D&D 5th Edition' },
  { id: 'pathfinder2e', name: 'Pathfinder 2e' },
  { id: 'coc7e', name: 'Call of Cthulhu 7e' },
  { id: 'starfinder', name: 'Starfinder' },
  { id: 'custom', name: '커스텀 시스템' },
];

const llmProviders = [
  {
    id: 'anthropic',
    name: 'Anthropic (Claude)',
    desc: '고품질 내러티브',
  },
  {
    id: 'openai',
    name: 'OpenAI (GPT-4)',
    desc: '다목적 활용',
  },
  {
    id: 'google',
    name: 'Google (Gemini)',
    desc: '빠른 응답',
  },
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
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [providerModels, setProviderModels] = useState<ProviderModel[]>([]);
  const [modelSource, setModelSource] = useState<'live' | 'static' | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    system: 'dnd5e',
    maxPlayers: 4,
    rulebook: '',
    provider: 'anthropic',
    model: '',
    gmAggressiveness: 2,
  });

  useEffect(() => {
    const loadProviderModels = async () => {
      setIsLoadingModels(true);
      try {
        const backendProvider = providerMapping[formData.provider];
        const res = (await settingsApi.getProviderModels(backendProvider)) as {
          data?: {
            source?: 'live' | 'static';
            models?: ProviderModel[];
          };
        };

        const models = res.data?.models ?? [];
        setProviderModels(models);
        setModelSource(res.data?.source ?? null);

        setFormData((prev: typeof formData) => {
          const hasCurrentModel = models.some((model) => model.id === prev.model);
          if (hasCurrentModel) {
            return prev;
          }

          return {
            ...prev,
            model: models[0]?.id ?? '',
          };
        });
      } catch {
        setProviderModels([]);
        setModelSource(null);
        setFormData((prev: typeof formData) => ({ ...prev, model: '' }));
      } finally {
        setIsLoadingModels(false);
      }
    };

    void loadProviderModels();
  }, [formData.provider]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error('세션 이름을 입력해주세요');
      return;
    }
    setIsLoading(true);
    try {
      const res = (await sessionApi.create({
        name: formData.name,
        gameSystem: formData.system,
        maxPlayers: formData.maxPlayers,
        primaryProvider: providerMapping[formData.provider],
        ...(formData.model ? { primaryModel: formData.model } : {}),
        gmAggressiveness: aggressivenessMapping[formData.gmAggressiveness],
      })) as any;
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
        className="flex items-center gap-1 text-body-sm text-text-secondary hover:text-text-primary mb-6 transition-colors"
      >
        <ArrowLeft size={16} />
        돌아가기
      </button>

      <div className="mb-8">
        <h2 className="text-heading-1 text-text-primary flex items-center gap-2">
          <Sparkles size={24} className="text-gold" />새 세션 만들기
        </h2>
        <p className="text-text-secondary mt-1 text-body-sm">새로운 TRPG 모험을 시작하세요</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* 세션 이름 */}
        <div className="card p-5">
          <label className="block text-body-sm font-medium text-text-primary mb-2">세션 이름</label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="예: 잃어버린 광산의 판델버"
            className="input-field"
            required
          />
        </div>

        {/* 게임 시스템 + 최대 인원 */}
        <div className="card p-5 space-y-4">
          <div>
            <label className="block text-body-sm font-medium text-text-primary mb-2">게임 시스템</label>
            <select
              value={formData.system}
              onChange={(e) => setFormData({ ...formData, system: e.target.value })}
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
            <label className="block text-body-sm font-medium text-text-primary mb-2">
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
            <label className="block text-body-sm font-medium text-text-primary mb-2">
              규칙서
              <span className="text-text-tertiary font-normal ml-1">(선택사항)</span>
            </label>
            <select
              value={formData.rulebook}
              onChange={(e) => setFormData({ ...formData, rulebook: e.target.value })}
              className="input-field"
            >
              <option value="">규칙서 없이 시작</option>
              <option value="phb">Player&apos;s Handbook</option>
              <option value="dmg">Dungeon Master&apos;s Guide</option>
            </select>
            <p className="text-caption text-text-tertiary mt-1.5">
              업로드된 규칙서를 선택하면 AI GM이 해당 규칙을 참고합니다
            </p>
          </div>
        </div>

        {/* LLM 프로바이더 */}
        <div className="card p-5">
          <label className="block text-body-sm font-medium text-text-primary mb-3">AI 프로바이더</label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {llmProviders.map((provider) => {
              const isSelected = formData.provider === provider.id;
              return (
                <button
                  key={provider.id}
                  type="button"
                  onClick={() => setFormData({ ...formData, provider: provider.id })}
                  className={`p-3.5 rounded-xl border text-left transition-all ${
                    isSelected
                      ? 'bg-gold/10 text-gold border-gold border-2'
                      : 'bg-bg-overlay text-text-secondary border-line hover:border-line-strong'
                  }`}
                >
                  <span className="text-body-sm font-medium block">{provider.name}</span>
                  <span className="text-caption opacity-70 mt-0.5 block">{provider.desc}</span>
                </button>
              );
            })}
          </div>
          <p className="text-caption text-text-tertiary mt-2">
            설정 페이지에서 해당 프로바이더의 API 키를 등록해야 합니다
          </p>

          <div className="mt-4">
            <label className="block text-body-sm font-medium text-text-primary mb-2">모델</label>
            <select
              value={formData.model}
              onChange={(e) => setFormData({ ...formData, model: e.target.value })}
              className="input-field"
              disabled={isLoadingModels || providerModels.length === 0}
            >
              {providerModels.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.label || model.id}
                </option>
              ))}
            </select>
            <p className="text-caption text-text-tertiary mt-1.5">
              {isLoadingModels
                ? '모델 목록을 불러오는 중...'
                : modelSource === 'live'
                  ? '실시간 모델 목록'
                  : modelSource === 'static'
                    ? '정적 fallback 모델 목록'
                    : '등록된 키가 없거나 모델 목록을 조회할 수 없습니다'}
            </p>
          </div>
        </div>

        {/* GM 적극성 */}
        <div className="card p-5">
          <label className="block text-body-sm font-medium text-text-primary mb-3">GM 적극성</label>
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
                    ? 'border-gold bg-gold/10 text-gold border-2'
                    : 'bg-bg-overlay text-text-secondary border-line hover:border-line-strong'
                }`}
              >
                <span className="text-body-sm font-medium block">{level.label}</span>
                <span className="text-caption text-text-tertiary mt-0.5 block">{level.desc}</span>
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
