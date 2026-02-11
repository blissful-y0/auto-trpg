'use client';

import { useEffect } from 'react';
import { getSocket } from '../socket';
import { useChatStore } from '../stores/chatStore';
import { useGameStore } from '../stores/gameStore';
import { useSaveStore } from '../stores/saveStore';

// 게임 이벤트 소켓 바인딩 훅
export function useGameSocket(sessionId: string, enabled = true) {
  const { addMessage, startStreaming, appendStreamContent, endStreaming } = useChatStore();
  const { startCombat, endCombat } = useGameStore();
  const { setAutoSaveStatus, addSavePoint } = useSaveStore();

  useEffect(() => {
    if (!enabled) return;

    const socket = getSocket();
    if (!socket) return;

    // GM 응답 수신
    const handleGmResponse = (payload: {
      sessionId: string;
      response: {
        narrative: string;
        diceRequests?: Array<{ notation: string; purpose: string; dc?: number }>;
      };
      timestamp: string;
    }) => {
      if (payload.sessionId !== sessionId) return;

      // GM 응답 대기 상태 해제
      const store = useChatStore.getState();
      if (store.isStreaming && !store.streamingContent) {
        useChatStore.setState({ isStreaming: false });
      }

      addMessage({
        id: `gm-${Date.now()}`,
        type: 'gm',
        sender: 'GM',
        content: payload.response.narrative,
        timestamp: new Date(payload.timestamp).toLocaleTimeString('ko-KR', {
          hour: '2-digit',
          minute: '2-digit',
        }),
        diceRequests: payload.response.diceRequests,
      });
    };

    // GM 스트리밍 수신
    const handleGmStream = (payload: { sessionId: string; chunk: string; done: boolean }) => {
      if (payload.sessionId !== sessionId) return;

      if (payload.done) {
        endStreaming({
          id: `gm-stream-${Date.now()}`,
          type: 'gm',
          sender: 'GM',
          content: useChatStore.getState().streamingContent + payload.chunk,
          timestamp: new Date().toLocaleTimeString('ko-KR', {
            hour: '2-digit',
            minute: '2-digit',
          }),
        });
      } else {
        if (!useChatStore.getState().isStreaming) {
          startStreaming();
        }
        appendStreamContent(payload.chunk);
      }
    };

    // 플레이어 참가 알림
    const handlePlayerJoined = (payload: { sessionId: string; name: string }) => {
      if (payload.sessionId !== sessionId) return;

      addMessage({
        id: `sys-join-${Date.now()}`,
        type: 'system',
        sender: '시스템',
        content: `${payload.name}님이 참가했습니다.`,
        timestamp: new Date().toLocaleTimeString('ko-KR', {
          hour: '2-digit',
          minute: '2-digit',
        }),
      });
    };

    // 플레이어 퇴장 알림
    const handlePlayerLeft = (payload: { sessionId: string; name: string }) => {
      if (payload.sessionId !== sessionId) return;

      addMessage({
        id: `sys-leave-${Date.now()}`,
        type: 'system',
        sender: '시스템',
        content: `${payload.name}님이 퇴장했습니다.`,
        timestamp: new Date().toLocaleTimeString('ko-KR', {
          hour: '2-digit',
          minute: '2-digit',
        }),
      });
    };

    // 주사위 결과 수신
    const handleDiceResult = (payload: {
      sessionId: string;
      dice: string;
      count: number;
      modifier: number;
      rolls: number[];
      total: number;
      reason: string;
    }) => {
      if (payload.sessionId !== sessionId) return;

      addMessage({
        id: `dice-${Date.now()}`,
        type: 'dice',
        sender: payload.reason || '주사위',
        content: `${payload.count}${payload.dice}${payload.modifier > 0 ? `+${payload.modifier}` : payload.modifier < 0 ? `${payload.modifier}` : ''}`,
        timestamp: new Date().toLocaleTimeString('ko-KR', {
          hour: '2-digit',
          minute: '2-digit',
        }),
        diceResult: {
          notation: `${payload.count}${payload.dice}`,
          rolls: payload.rolls,
          total: payload.total,
          modifier: payload.modifier,
        },
      });
    };

    // 전투 업데이트 수신
    const handleCombatUpdate = (payload: { sessionId: string; combatState: unknown }) => {
      if (payload.sessionId !== sessionId) return;

      const state = payload.combatState as {
        status?: string;
        combatants?: Array<{
          id: string;
          name: string;
          initiative: number;
          hp: { current: number; max: number };
          ac: number;
          isPlayer: boolean;
          isCurrentTurn: boolean;
        }>;
      };

      if (state.status === 'ended') {
        endCombat();
      } else if (state.combatants) {
        startCombat(state.combatants);
      }
    };

    // 세이브 완료 수신
    const handleSaveComplete = (payload: {
      sessionId: string;
      savePointId: string;
      saveType: 'manual' | 'auto' | 'pause';
      name: string;
      createdAt: string;
    }) => {
      if (payload.sessionId !== sessionId) return;

      addSavePoint({
        id: payload.savePointId,
        saveType: payload.saveType,
        name: payload.name,
        sceneNumber: 0,
        characterCount: 0,
        createdBy: '',
        createdAt: payload.createdAt,
      });
    };

    // 로드 완료 수신 — 페이지 새로고침으로 상태 복원
    const handleLoadComplete = (payload: {
      sessionId: string;
      savePointId: string;
      restored: boolean;
    }) => {
      if (payload.sessionId !== sessionId) return;
      if (payload.restored) {
        window.location.reload();
      }
    };

    // 세션 일시정지 수신
    const handleSessionPaused = (payload: { sessionId: string }) => {
      if (payload.sessionId !== sessionId) return;

      addMessage({
        id: `sys-pause-${Date.now()}`,
        type: 'system',
        sender: '시스템',
        content: '세션이 일시정지되었습니다.',
        timestamp: new Date().toLocaleTimeString('ko-KR', {
          hour: '2-digit',
          minute: '2-digit',
        }),
      });
    };

    // 세션 재개 수신
    const handleSessionResumed = (payload: { sessionId: string }) => {
      if (payload.sessionId !== sessionId) return;

      addMessage({
        id: `sys-resume-${Date.now()}`,
        type: 'system',
        sender: '시스템',
        content: '세션이 재개되었습니다.',
        timestamp: new Date().toLocaleTimeString('ko-KR', {
          hour: '2-digit',
          minute: '2-digit',
        }),
      });
    };

    // 자동 세이브 인디케이터 수신
    const handleAutoSaveIndicator = (payload: {
      sessionId: string;
      status: 'saving' | 'saved' | 'error';
    }) => {
      if (payload.sessionId !== sessionId) return;
      setAutoSaveStatus(payload.status);
    };

    // 에러 수신
    const handleError = (payload: { code: string; message: string }) => {
      console.error(`소켓 에러 [${payload.code}]:`, payload.message);
      addMessage({
        id: `err-${Date.now()}`,
        type: 'system',
        sender: '시스템',
        content: `오류: ${payload.message}`,
        timestamp: new Date().toLocaleTimeString('ko-KR', {
          hour: '2-digit',
          minute: '2-digit',
        }),
      });
    };

    // 이벤트 리스너 등록
    socket.on('gm:response', handleGmResponse);
    socket.on('gm:stream', handleGmStream);
    socket.on('player:joined', handlePlayerJoined);
    socket.on('player:left', handlePlayerLeft);
    socket.on('dice:result', handleDiceResult);
    socket.on('combat:update', handleCombatUpdate);
    socket.on('error', handleError);
    socket.on('session:saveComplete', handleSaveComplete);
    socket.on('session:loadComplete', handleLoadComplete);
    socket.on('session:paused', handleSessionPaused);
    socket.on('session:resumed', handleSessionResumed);
    socket.on('session:autoSaveIndicator', handleAutoSaveIndicator);

    return () => {
      socket.off('gm:response', handleGmResponse);
      socket.off('gm:stream', handleGmStream);
      socket.off('player:joined', handlePlayerJoined);
      socket.off('player:left', handlePlayerLeft);
      socket.off('dice:result', handleDiceResult);
      socket.off('combat:update', handleCombatUpdate);
      socket.off('error', handleError);
      socket.off('session:saveComplete', handleSaveComplete);
      socket.off('session:loadComplete', handleLoadComplete);
      socket.off('session:paused', handleSessionPaused);
      socket.off('session:resumed', handleSessionResumed);
      socket.off('session:autoSaveIndicator', handleAutoSaveIndicator);
    };
  }, [
    enabled,
    sessionId,
    addMessage,
    startStreaming,
    appendStreamContent,
    endStreaming,
    startCombat,
    endCombat,
    setAutoSaveStatus,
    addSavePoint,
  ]);
}
