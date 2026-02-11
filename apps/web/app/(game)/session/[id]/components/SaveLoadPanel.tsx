'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Save, Upload, Trash2, Pause, Play, Clock, HardDrive, Timer } from 'lucide-react';
import { saveApi } from '@/lib/api';
import { useSaveStore } from '@/lib/stores/saveStore';

interface SaveLoadPanelProps {
  sessionId: string;
  isCreator: boolean;
  sessionStatus: string;
}

const saveTypeIcon: Record<string, React.ElementType> = {
  manual: HardDrive,
  auto: Timer,
  pause: Pause,
};

const saveTypeLabel: Record<string, string> = {
  manual: '수동',
  auto: '자동',
  pause: '일시정지',
};

export default function SaveLoadPanel({ sessionId, isCreator, sessionStatus }: SaveLoadPanelProps) {
  const {
    savePoints,
    isLoading,
    isSaving,
    setSavePoints,
    setIsLoading,
    setIsSaving,
    removeSavePoint,
  } = useSaveStore();

  const [saveName, setSaveName] = useState('');
  const [showNameInput, setShowNameInput] = useState(false);
  const [confirmLoadId, setConfirmLoadId] = useState<string | null>(null);

  // 세이브포인트 목록 로드
  const loadSavePoints = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await saveApi.list(sessionId);
      setSavePoints(res.data || []);
    } catch (err) {
      const message = err instanceof Error ? err.message : '세이브포인트 목록 로드 실패';
      toast.error(message);
      setIsLoading(false);
    }
  }, [sessionId, setSavePoints, setIsLoading]);

  useEffect(() => {
    void loadSavePoints();
  }, [loadSavePoints]);

  // 수동 세이브
  const handleSave = async () => {
    setIsSaving(true);
    try {
      await saveApi.save(sessionId, saveName || undefined);
      toast.success('세이브 완료');
      setSaveName('');
      setShowNameInput(false);
      await loadSavePoints();
    } catch (err) {
      const message = err instanceof Error ? err.message : '세이브 실패';
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  // 로드
  const handleLoad = async (savePointId: string) => {
    try {
      await saveApi.load(sessionId, savePointId);
      toast.success('세이브포인트가 복원되었습니다');
      setConfirmLoadId(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : '로드 실패';
      toast.error(message);
    }
  };

  // 삭제
  const handleDelete = async (savePointId: string) => {
    try {
      await saveApi.delete(sessionId, savePointId);
      removeSavePoint(savePointId);
      toast.success('세이브포인트가 삭제되었습니다');
    } catch (err) {
      const message = err instanceof Error ? err.message : '삭제 실패';
      toast.error(message);
    }
  };

  // 일시정지
  const handlePause = async () => {
    try {
      await saveApi.pause(sessionId);
      toast.success('세션이 일시정지되었습니다');
      await loadSavePoints();
    } catch (err) {
      const message = err instanceof Error ? err.message : '일시정지 실패';
      toast.error(message);
    }
  };

  // 재개
  const handleResume = async () => {
    try {
      await saveApi.resume(sessionId);
      toast.success('세션이 재개되었습니다');
    } catch (err) {
      const message = err instanceof Error ? err.message : '재개 실패';
      toast.error(message);
    }
  };

  return (
    <div className="p-4 space-y-4">
      {/* 세이브 버튼 영역 */}
      <div className="space-y-2">
        {showNameInput ? (
          <div className="flex gap-2">
            <input
              type="text"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              placeholder="세이브 이름 (선택)"
              className="input-field flex-1 text-sm"
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleSave();
              }}
            />
            <button
              onClick={() => void handleSave()}
              disabled={isSaving}
              className="px-3 py-1.5 bg-gold text-text-inverse text-sm rounded hover:bg-gold/90 transition-colors disabled:opacity-50"
            >
              {isSaving ? '...' : '저장'}
            </button>
            <button
              onClick={() => setShowNameInput(false)}
              className="px-2 py-1.5 text-sm text-text-tertiary hover:text-text-secondary"
            >
              취소
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={() => setShowNameInput(true)}
              disabled={sessionStatus === 'paused'}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-bg-elevated border border-line rounded text-sm hover:bg-bg-surface transition-colors disabled:opacity-50"
            >
              <Save size={14} />
              수동 세이브
            </button>

            {isCreator && (
              <>
                {sessionStatus === 'active' ? (
                  <button
                    onClick={() => void handlePause()}
                    className="flex items-center gap-1.5 px-3 py-2 bg-bg-elevated border border-line rounded text-sm text-amber-400 hover:bg-bg-surface transition-colors"
                  >
                    <Pause size={14} />
                    일시정지
                  </button>
                ) : sessionStatus === 'paused' ? (
                  <button
                    onClick={() => void handleResume()}
                    className="flex items-center gap-1.5 px-3 py-2 bg-gold/10 border border-gold/30 rounded text-sm text-gold hover:bg-gold/20 transition-colors"
                  >
                    <Play size={14} />
                    재개
                  </button>
                ) : null}
              </>
            )}
          </div>
        )}
      </div>

      {/* 세이브포인트 목록 */}
      <div className="space-y-1">
        <h3 className="text-xs font-medium text-text-tertiary uppercase tracking-wider">
          세이브포인트 ({savePoints.length})
        </h3>

        {isLoading ? (
          <div className="text-sm text-text-tertiary text-center py-4">로딩 중...</div>
        ) : savePoints.length === 0 ? (
          <div className="text-sm text-text-tertiary text-center py-4">
            세이브포인트가 없습니다
          </div>
        ) : (
          <div className="space-y-1 max-h-[calc(100vh-320px)] overflow-y-auto">
            {savePoints.map((sp) => {
              const TypeIcon = saveTypeIcon[sp.saveType] || Clock;
              const isConfirming = confirmLoadId === sp.id;

              return (
                <div
                  key={sp.id}
                  className="p-2.5 bg-bg-elevated border border-line rounded text-sm group"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <TypeIcon size={12} className="text-text-tertiary shrink-0" />
                        <span className="text-[10px] text-text-tertiary">
                          {saveTypeLabel[sp.saveType]}
                        </span>
                        <span className="text-[10px] text-text-tertiary">
                          장면 {sp.sceneNumber}
                        </span>
                        <span className="text-[10px] text-text-tertiary">
                          캐릭터 {sp.characterCount}
                        </span>
                      </div>
                      <div className="text-text-primary truncate mt-0.5">
                        {sp.name || '이름 없음'}
                      </div>
                      <div className="text-[10px] text-text-tertiary mt-0.5">
                        {new Date(sp.createdAt).toLocaleString('ko-KR', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {isConfirming ? (
                        <>
                          <button
                            onClick={() => void handleLoad(sp.id)}
                            className="px-2 py-1 text-[10px] bg-gold text-text-inverse rounded"
                          >
                            확인
                          </button>
                          <button
                            onClick={() => setConfirmLoadId(null)}
                            className="px-2 py-1 text-[10px] text-text-tertiary"
                          >
                            취소
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => setConfirmLoadId(sp.id)}
                            title="로드"
                            className="p-1 text-text-tertiary hover:text-gold transition-colors"
                          >
                            <Upload size={14} />
                          </button>
                          {isCreator && (
                            <button
                              onClick={() => void handleDelete(sp.id)}
                              title="삭제"
                              className="p-1 text-text-tertiary hover:text-red-400 transition-colors"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
