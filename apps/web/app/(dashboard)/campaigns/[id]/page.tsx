'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Scroll,
  Plus,
  Play,
  Pause,
  CheckCircle2,
  Archive,
  Edit3,
  Loader2,
} from 'lucide-react';
import { campaignApi } from '@/lib/api';

interface SessionSummary {
  id: string;
  name: string;
  status: string;
  sessionOrder: number;
  createdAt: string;
  updatedAt: string;
}

interface CampaignDetail {
  id: string;
  name: string;
  description: string;
  game_system: string;
  status: 'active' | 'completed' | 'archived';
  world_state: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  sessions: SessionSummary[];
}

const sessionStatusLabel: Record<string, { label: string; className: string }> = {
  waiting: { label: '대기', className: 'text-text-tertiary bg-bg-overlay' },
  active: { label: '진행 중', className: 'text-gold bg-gold/10' },
  paused: { label: '일시정지', className: 'text-amber-400 bg-amber-400/10' },
  completed: { label: '완료', className: 'text-success bg-success/10' },
};

export default function CampaignDetailPage() {
  const params = useParams();
  const router = useRouter();
  const campaignId = params.id as string;

  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [saving, setSaving] = useState(false);

  // 새 세션 생성 폼
  const [showNewSession, setShowNewSession] = useState(false);
  const [newSessionName, setNewSessionName] = useState('');
  const [creatingSession, setCreatingSession] = useState(false);

  const loadCampaign = useCallback(async () => {
    try {
      const res = await campaignApi.get(campaignId);
      const data = res.data as CampaignDetail;
      setCampaign(data);
      setEditName(data.name);
      setEditDescription(data.description);
    } catch (err) {
      const message = err instanceof Error ? err.message : '캠페인 로드 실패';
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    void loadCampaign();
  }, [loadCampaign]);

  const handleSaveEdit = async () => {
    if (!editName.trim()) return;
    setSaving(true);
    try {
      await campaignApi.update(campaignId, {
        name: editName.trim(),
        description: editDescription.trim(),
      });
      toast.success('캠페인이 수정되었습니다');
      setIsEditing(false);
      await loadCampaign();
    } catch (err) {
      const message = err instanceof Error ? err.message : '수정 실패';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (status: 'active' | 'completed' | 'archived') => {
    try {
      await campaignApi.update(campaignId, { status });
      toast.success('캠페인 상태가 변경되었습니다');
      await loadCampaign();
    } catch (err) {
      const message = err instanceof Error ? err.message : '상태 변경 실패';
      toast.error(message);
    }
  };

  const handleCreateSession = async () => {
    if (!newSessionName.trim()) {
      toast.error('세션 이름을 입력해주세요');
      return;
    }
    setCreatingSession(true);
    try {
      await campaignApi.createSession(campaignId, {
        name: newSessionName.trim(),
      });
      toast.success('세션이 추가되었습니다');
      setShowNewSession(false);
      setNewSessionName('');
      await loadCampaign();
    } catch (err) {
      const message = err instanceof Error ? err.message : '세션 생성 실패';
      toast.error(message);
    } finally {
      setCreatingSession(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-gold" />
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="max-w-3xl mx-auto text-center py-20">
        <p className="text-text-secondary">캠페인을 찾을 수 없습니다</p>
        <button
          onClick={() => router.push('/campaigns')}
          className="mt-4 text-gold hover:underline text-sm"
        >
          캠페인 목록으로
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* 뒤로가기 */}
      <button
        onClick={() => router.push('/campaigns')}
        className="flex items-center gap-1 text-body-sm text-text-secondary hover:text-text-primary mb-6 transition-colors"
      >
        <ArrowLeft size={16} />
        캠페인 목록
      </button>

      {/* 헤더 */}
      <div className="mb-6">
        {isEditing ? (
          <div className="space-y-3">
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="input-field w-full text-lg font-medium"
            />
            <textarea
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              rows={2}
              className="input-field w-full resize-none text-sm"
              placeholder="캠페인 설명"
            />
            <div className="flex gap-2">
              <button
                onClick={() => void handleSaveEdit()}
                disabled={saving}
                className="btn-primary text-sm"
              >
                {saving ? '저장 중...' : '저장'}
              </button>
              <button
                onClick={() => setIsEditing(false)}
                className="text-sm text-text-tertiary hover:text-text-secondary"
              >
                취소
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-heading-1 text-text-primary flex items-center gap-2">
                  <Scroll size={24} className="text-gold" />
                  {campaign.name}
                </h2>
                {campaign.description && (
                  <p className="text-text-secondary text-body-sm mt-1">{campaign.description}</p>
                )}
                <div className="flex items-center gap-3 mt-2 text-xs text-text-tertiary">
                  <span>{campaign.game_system}</span>
                  <span>{campaign.sessions.length}개 세션</span>
                  <span>
                    생성: {new Date(campaign.created_at).toLocaleDateString('ko-KR')}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setIsEditing(true)}
                className="p-2 text-text-tertiary hover:text-text-primary transition-colors"
                title="편집"
              >
                <Edit3 size={16} />
              </button>
            </div>

            {/* 상태 변경 버튼 */}
            <div className="flex gap-2 mt-4">
              {campaign.status !== 'completed' && (
                <button
                  onClick={() => void handleStatusChange('completed')}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-line rounded hover:bg-bg-elevated transition-colors text-success"
                >
                  <CheckCircle2 size={12} />
                  완료로 변경
                </button>
              )}
              {campaign.status !== 'archived' && (
                <button
                  onClick={() => void handleStatusChange('archived')}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-line rounded hover:bg-bg-elevated transition-colors text-text-tertiary"
                >
                  <Archive size={12} />
                  보관
                </button>
              )}
              {campaign.status !== 'active' && (
                <button
                  onClick={() => void handleStatusChange('active')}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-line rounded hover:bg-bg-elevated transition-colors text-gold"
                >
                  <Play size={12} />
                  다시 활성화
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* 세션 목록 */}
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-medium text-text-secondary">세션 목록</h3>
        <button
          onClick={() => setShowNewSession(!showNewSession)}
          className="flex items-center gap-1 text-xs text-gold hover:text-gold/80 transition-colors"
        >
          <Plus size={14} />
          새 세션
        </button>
      </div>

      {/* 새 세션 폼 */}
      {showNewSession && (
        <div className="card p-3 mb-3 flex gap-2">
          <input
            type="text"
            value={newSessionName}
            onChange={(e) => setNewSessionName(e.target.value)}
            placeholder="세션 이름"
            className="input-field flex-1 text-sm"
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleCreateSession();
            }}
          />
          <button
            onClick={() => void handleCreateSession()}
            disabled={creatingSession || !newSessionName.trim()}
            className="btn-primary text-sm disabled:opacity-50"
          >
            {creatingSession ? '...' : '추가'}
          </button>
          <button
            onClick={() => setShowNewSession(false)}
            className="text-sm text-text-tertiary hover:text-text-secondary"
          >
            취소
          </button>
        </div>
      )}

      {campaign.sessions.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-text-tertiary text-sm">아직 세션이 없습니다</p>
          <p className="text-text-tertiary text-xs mt-1">
            새 세션을 추가하여 캠페인을 시작하세요
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {campaign.sessions.map((s, idx) => {
            const statusCfg = sessionStatusLabel[s.status] || sessionStatusLabel.waiting;
            const SessionIcon = s.status === 'active' ? Play : s.status === 'paused' ? Pause : CheckCircle2;

            return (
              <Link
                key={s.id}
                href={`/session/${s.id}`}
                className="card p-3 flex items-center gap-3 hover:bg-bg-elevated transition-colors group"
              >
                <div className="w-7 h-7 rounded-full bg-bg-overlay flex items-center justify-center text-xs font-medium text-text-tertiary shrink-0">
                  {idx + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-text-primary text-sm font-medium truncate">
                      {s.name}
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${statusCfg.className}`}>
                      <SessionIcon size={10} className="inline mr-0.5" />
                      {statusCfg.label}
                    </span>
                  </div>
                  <div className="text-[10px] text-text-tertiary mt-0.5">
                    {new Date(s.updatedAt).toLocaleDateString('ko-KR', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
