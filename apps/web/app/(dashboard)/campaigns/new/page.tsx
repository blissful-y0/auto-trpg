'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, ArrowLeft, Map } from 'lucide-react';
import { campaignApi } from '@/lib/api';

const gameSystems = [
  { id: 'dnd5e', name: 'D&D 5th Edition' },
  { id: 'pathfinder2e', name: 'Pathfinder 2e' },
  { id: 'coc7e', name: 'Call of Cthulhu 7e' },
  { id: 'starfinder', name: 'Starfinder' },
  { id: 'custom', name: '커스텀 시스템' },
];

export default function NewCampaignPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    gameSystem: 'dnd5e',
  });

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error('캠페인 이름을 입력해주세요');
      return;
    }
    setIsLoading(true);
    try {
      const res = (await campaignApi.create({
        name: formData.name,
        description: formData.description || undefined,
        gameSystem: formData.gameSystem,
      })) as any;
      toast.success('캠페인이 생성되었습니다');
      router.push(`/campaigns/${res.data.id}`);
    } catch (err: any) {
      toast.error(err.message || '캠페인 생성에 실패했습니다');
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
          <Map size={24} className="text-gold" />새 캠페인 만들기
        </h2>
        <p className="text-text-secondary mt-1 text-body-sm">
          여러 세션에 걸친 장기 모험을 시작하세요
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* 캠페인 이름 */}
        <div className="card p-5">
          <label className="block text-body-sm font-medium text-text-primary mb-2">
            캠페인 이름
          </label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="예: 파운데릴 대륙의 잊혀진 왕국"
            className="input-field"
            required
          />
        </div>

        {/* 설명 */}
        <div className="card p-5">
          <label className="block text-body-sm font-medium text-text-primary mb-2">
            설명
            <span className="text-text-tertiary font-normal ml-1">(선택사항)</span>
          </label>
          <textarea
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="캠페인의 배경, 목표, 분위기를 적어주세요"
            className="input-field min-h-[100px] resize-y"
            rows={4}
          />
        </div>

        {/* 게임 시스템 */}
        <div className="card p-5">
          <label className="block text-body-sm font-medium text-text-primary mb-2">
            게임 시스템
          </label>
          <select
            value={formData.gameSystem}
            onChange={(e) => setFormData({ ...formData, gameSystem: e.target.value })}
            className="input-field"
          >
            {gameSystems.map((sys) => (
              <option key={sys.id} value={sys.id}>
                {sys.name}
              </option>
            ))}
          </select>
        </div>

        {/* 제출 */}
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
                <Map size={18} />
                캠페인 생성
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
