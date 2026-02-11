'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { useSocket } from '@/lib/hooks/useSocket';
import { useGameSocket } from '@/lib/hooks/useGameSocket';
import { useGameStore } from '@/lib/stores/gameStore';
import { useChatStore } from '@/lib/stores/chatStore';
import { sessionApi, chatApi, settingsApi, ApiError } from '@/lib/api';
import { User, Dice5, Swords, BookOpen, Save, PanelRightClose, PanelRightOpen } from 'lucide-react';
import ChatPanel from './components/ChatPanel';
import CharacterSheet from './components/CharacterSheet';
import DiceRoller from './components/DiceRoller';
import CombatTracker from './components/CombatTracker';
import NarrativeLog from './components/NarrativeLog';
import SaveLoadPanel from './components/SaveLoadPanel';
import AutoSaveIndicator from './components/AutoSaveIndicator';

type RightPanel = 'character' | 'dice' | 'combat' | 'narrative' | 'save';

type ProviderId = 'claude' | 'openai' | 'gemini';

interface ProviderModel {
  id: string;
  label: string;
}

const providerLabel: Record<ProviderId, string> = {
  claude: 'Anthropic (Claude)',
  openai: 'OpenAI',
  gemini: 'Google (Gemini)',
};

const panelTabs: { key: RightPanel; label: string; icon: React.ElementType }[] = [
  { key: 'character', label: '캐릭터', icon: User },
  { key: 'dice', label: '주사위', icon: Dice5 },
  { key: 'combat', label: '전투', icon: Swords },
  { key: 'narrative', label: '이야기', icon: BookOpen },
  { key: 'save', label: '세이브', icon: Save },
];

export default function GameSessionPage() {
  const params = useParams();
  const sessionId = params.id as string;

  // Supabase 세션에서 토큰 가져오기
  const [token, setToken] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [readyForRealtime, setReadyForRealtime] = useState(false);
  const { session, setSession } = useGameStore();
  const { addMessage, clearMessages } = useChatStore();
  const [availableModels, setAvailableModels] = useState<ProviderModel[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [savingModel, setSavingModel] = useState(false);
  const [modelSource, setModelSource] = useState<'live' | 'static' | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      setToken(session?.access_token ?? null);
      setCurrentUserId(session?.user?.id ?? null);
    });
  }, []);

  // 소켓 연결 및 게임 이벤트 바인딩
  useSocket(sessionId, readyForRealtime ? token : null);
  useGameSocket(sessionId, readyForRealtime);

  // 초기 데이터 로드
  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    const loadSessionData = async () => {
      clearMessages();

      try {
        // 먼저 세션 조회 시도
        const sessionRes: any = await sessionApi.get(sessionId);
        if (cancelled) return;

        if (sessionRes?.data) {
          setSession(sessionRes.data);
        }
      } catch (err) {
        // 참가자가 아닌 경우(403)만 자동 참가 시도
        if (!(err instanceof ApiError && err.status === 403)) {
          throw err;
        }

        await sessionApi.join(sessionId);
        if (cancelled) return;

        const sessionRes: any = await sessionApi.get(sessionId);
        if (cancelled) return;

        if (sessionRes?.data) {
          setSession(sessionRes.data);
        }
      }

      const messagesRes: any = await chatApi.getMessages(sessionId);
      if (cancelled) return;

      const messages = messagesRes?.data || [];
      messages.forEach((msg: any, idx: number) => {
        addMessage({
          id:
            msg.id ||
            `hist-${msg.created_at || 'unknown'}-${msg.sender_id || msg.sender_type || 'unknown'}-${idx}`,
          type: msg.sender_type === 'gm' ? 'gm' : msg.is_ooc ? 'ooc' : 'player',
          sender: msg.sender_type === 'gm' ? 'GM' : msg.sender_id || '플레이어',
          content: msg.content,
          timestamp: new Date(msg.created_at).toLocaleTimeString('ko-KR', {
            hour: '2-digit',
            minute: '2-digit',
          }),
        });
      });

      setReadyForRealtime(true);
    };

    loadSessionData().catch((err) => {
      console.error(err);
      if (!cancelled) {
        const message = err instanceof Error ? err.message : '세션에 연결하지 못했습니다.';
        toast.error(message);
      }
    });

    return () => {
      cancelled = true;
      setReadyForRealtime(false);
    };
  }, [token, sessionId, setSession, addMessage, clearMessages]);

  const [rightPanel, setRightPanel] = useState<RightPanel>('character');
  const [showRightPanel, setShowRightPanel] = useState(true);

  const sessionName = (session as any)?.name || '게임 세션';
  const gameSystem = (session as any)?.game_system || '';
  const primaryProvider = ((session as any)?.primary_provider ?? 'claude') as ProviderId;
  const selectedModel = ((session as any)?.settings?.llm?.model as string | undefined) ?? '';
  const canEditModel = currentUserId != null && (session as any)?.created_by === currentUserId;

  useEffect(() => {
    if (!primaryProvider) {
      return;
    }

    let cancelled = false;

    const loadModels = async () => {
      setLoadingModels(true);
      try {
        const res = (await settingsApi.getProviderModels(primaryProvider)) as {
          data?: {
            source?: 'live' | 'static';
            models?: ProviderModel[];
          };
        };

        if (cancelled) return;

        setModelSource(res.data?.source ?? null);
        setAvailableModels(res.data?.models ?? []);
      } catch {
        if (cancelled) return;
        setModelSource(null);
        setAvailableModels([]);
      } finally {
        if (cancelled) return;
        setLoadingModels(false);
      }
    };

    void loadModels();

    return () => {
      cancelled = true;
    };
  }, [primaryProvider]);

  const handleModelChange = async (model: string) => {
    if (!canEditModel || !model) {
      return;
    }

    setSavingModel(true);
    try {
      const updated = (await sessionApi.update(sessionId, {
        primaryProvider,
        primaryModel: model,
      })) as any;

      if (updated?.data) {
        setSession(updated.data);
      }

      toast.success('세션 모델 설정이 업데이트되었습니다');
    } catch (err) {
      const message = err instanceof Error ? err.message : '세션 모델 업데이트에 실패했습니다';
      toast.error(message);
    } finally {
      setSavingModel(false);
    }
  };

  return (
    <div className="flex h-full">
      {/* 왼쪽: 채팅 패널 */}
      <div className="flex-1 flex flex-col min-w-0">
        <ChatPanel sessionId={sessionId} sessionName={sessionName} gameSystem={gameSystem} />
      </div>

      {/* 오른쪽 패널 토글 버튼 */}
      <button
        onClick={() => setShowRightPanel(!showRightPanel)}
        className="hidden md:flex items-center justify-center w-6 border-l border-line bg-bg-surface text-text-tertiary hover:text-text-secondary hover:bg-bg-elevated transition-colors"
        title={showRightPanel ? '패널 닫기' : '패널 열기'}
      >
        {showRightPanel ? <PanelRightClose size={14} /> : <PanelRightOpen size={14} />}
      </button>

      {/* 모바일 FAB */}
      <button
        onClick={() => setShowRightPanel(!showRightPanel)}
        className="md:hidden fixed bottom-4 right-4 z-50 w-12 h-12 bg-gold rounded-full flex items-center justify-center shadow-lg shadow-glow"
      >
        {showRightPanel ? (
          <PanelRightClose size={18} className="text-text-inverse" />
        ) : (
          <PanelRightOpen size={18} className="text-text-inverse" />
        )}
      </button>

      {/* 오른쪽: 게임 정보 패널 */}
      {showRightPanel && (
        <div
          className="w-80 lg:w-96 border-l border-line bg-bg-surface flex flex-col
            fixed md:static inset-y-0 right-0 z-40 md:z-auto"
        >
          {/* 패널 탭 */}
          <div className="flex border-b border-line">
            {panelTabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.key}
                  onClick={() => setRightPanel(tab.key)}
                  className={`flex-1 flex flex-col items-center gap-1 px-2 py-2.5 text-xs font-medium transition-all ${
                    rightPanel === tab.key
                      ? 'text-gold border-b-2 border-gold bg-gold/5'
                      : 'text-text-tertiary hover:text-text-secondary'
                  }`}
                >
                  <Icon size={16} />
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="border-b border-line px-3 py-1.5 flex justify-end">
            <AutoSaveIndicator />
          </div>

          <div className="border-b border-line px-3 py-3 space-y-2">
            <div className="text-[11px] text-text-tertiary">
              현재 프로바이더: {providerLabel[primaryProvider]}
            </div>
            <select
              value={selectedModel}
              onChange={(e) => {
                void handleModelChange(e.target.value);
              }}
              disabled={
                !canEditModel || savingModel || loadingModels || availableModels.length === 0
              }
              className="input-field text-sm"
            >
              {availableModels.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.label || model.id}
                </option>
              ))}
            </select>
            <div className="text-[11px] text-text-tertiary">
              {!canEditModel
                ? '세션 생성자만 모델을 변경할 수 있습니다'
                : savingModel
                  ? '모델 설정 저장 중...'
                  : loadingModels
                    ? '모델 목록 조회 중...'
                    : modelSource === 'live'
                      ? '실시간 모델 목록'
                      : modelSource === 'static'
                        ? '정적 fallback 모델 목록'
                        : '모델 목록을 조회하지 못했습니다'}
            </div>
          </div>

          {/* 패널 내용 */}
          <div className="flex-1 overflow-y-auto">
            {rightPanel === 'character' && <CharacterSheet />}
            {rightPanel === 'dice' && <DiceRoller sessionId={sessionId} />}
            {rightPanel === 'combat' && <CombatTracker />}
            {rightPanel === 'narrative' && <NarrativeLog />}
            {rightPanel === 'save' && (
              <SaveLoadPanel
                sessionId={sessionId}
                isCreator={currentUserId != null && (session as any)?.created_by === currentUserId}
                sessionStatus={(session as any)?.status ?? 'waiting'}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
