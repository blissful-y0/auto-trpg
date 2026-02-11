'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Scroll, Plus, ChevronRight, Archive, CheckCircle2 } from 'lucide-react';
import { campaignApi } from '@/lib/api';

interface CampaignItem {
  id: string;
  name: string;
  description: string;
  game_system: string;
  status: 'active' | 'completed' | 'archived';
  created_at: string;
  updated_at: string;
}

const statusConfig: Record<string, { label: string; className: string; icon: React.ElementType }> = {
  active: { label: '진행 중', className: 'text-gold bg-gold/10', icon: Scroll },
  completed: { label: '완료', className: 'text-success bg-success/10', icon: CheckCircle2 },
  archived: { label: '보관됨', className: 'text-text-tertiary bg-bg-overlay', icon: Archive },
};

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<CampaignItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newSystem, setNewSystem] = useState('dnd5e');
  const [creating, setCreating] = useState(false);

  const loadCampaigns = useCallback(async () => {
    try {
      const res = await campaignApi.list();
      setCampaigns((res.data || []) as CampaignItem[]);
    } catch (err) {
      const message = err instanceof Error ? err.message : '캠페인 목록 로드 실패';
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCampaigns();
  }, [loadCampaigns]);

  const handleCreate = async () => {
    if (!newName.trim()) {
      toast.error('캠페인 이름을 입력해주세요');
      return;
    }

    setCreating(true);
    try {
      await campaignApi.create({
        name: newName.trim(),
        description: newDescription.trim(),
        gameSystem: newSystem,
      });
      toast.success('캠페인이 생성되었습니다');
      setShowCreateForm(false);
      setNewName('');
      setNewDescription('');
      setNewSystem('dnd5e');
      await loadCampaigns();
    } catch (err) {
      const message = err instanceof Error ? err.message : '캠페인 생성 실패';
      toast.error(message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-heading-1 text-text-primary flex items-center gap-2">
          <Scroll size={24} className="text-gold" />
          캠페인
        </h2>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="btn-primary flex items-center gap-2 text-sm"
        >
          <Plus size={16} />
          새 캠페인
        </button>
      </div>

      <p className="text-text-secondary text-body-sm mb-6">
        여러 세션을 하나의 캠페인으로 연결하여 이어가는 모험을 관리합니다
      </p>

      {/* 생성 폼 */}
      {showCreateForm && (
        <div className="card p-4 mb-6 space-y-3">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="캠페인 이름"
            className="input-field w-full"
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleCreate();
            }}
          />
          <textarea
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            placeholder="캠페인 설명 (선택)"
            rows={2}
            className="input-field w-full resize-none"
          />
          <div className="flex items-center gap-3">
            <select
              value={newSystem}
              onChange={(e) => setNewSystem(e.target.value)}
              className="input-field"
            >
              <option value="dnd5e">D&D 5e</option>
              <option value="pathfinder2e">Pathfinder 2e</option>
              <option value="coc7e">Call of Cthulhu 7e</option>
              <option value="custom">커스텀</option>
            </select>
            <div className="flex-1" />
            <button
              onClick={() => setShowCreateForm(false)}
              className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
            >
              취소
            </button>
            <button
              onClick={() => void handleCreate()}
              disabled={creating || !newName.trim()}
              className="btn-primary text-sm disabled:opacity-50"
            >
              {creating ? '생성 중...' : '생성'}
            </button>
          </div>
        </div>
      )}

      {/* 캠페인 목록 */}
      {isLoading ? (
        <div className="text-text-tertiary text-center py-12">로딩 중...</div>
      ) : campaigns.length === 0 ? (
        <div className="card p-12 text-center">
          <Scroll size={40} className="text-text-tertiary mx-auto mb-3" />
          <p className="text-text-secondary">아직 캠페인이 없습니다</p>
          <p className="text-text-tertiary text-body-sm mt-1">
            새 캠페인을 만들어 모험을 시작하세요
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {campaigns.map((c) => {
            const config = statusConfig[c.status] || statusConfig.active;
            const StatusIcon = config.icon;

            return (
              <Link
                key={c.id}
                href={`/campaigns/${c.id}`}
                className="card p-4 flex items-center gap-4 hover:bg-bg-elevated transition-colors group"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-text-primary font-medium truncate">
                      {c.name}
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${config.className}`}>
                      <StatusIcon size={10} className="inline mr-0.5" />
                      {config.label}
                    </span>
                  </div>
                  {c.description && (
                    <p className="text-text-tertiary text-body-sm mt-0.5 truncate">
                      {c.description}
                    </p>
                  )}
                  <div className="flex items-center gap-3 mt-1 text-[10px] text-text-tertiary">
                    <span>{c.game_system}</span>
                    <span>
                      {new Date(c.updated_at).toLocaleDateString('ko-KR', {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                  </div>
                </div>
                <ChevronRight
                  size={16}
                  className="text-text-tertiary group-hover:text-gold transition-colors shrink-0"
                />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
