// Socket.io 이벤트 핸들러 — 클라이언트 이벤트 처리 및 브로드캐스트

import type { Server, Socket } from 'socket.io';
import type {
  ClientEvents,
  ServerEvents,
  SocketData,
  PlayerJoinPayload,
  PlayerLeavePayload,
  PlayerActionPayload,
  DiceRollPayload,
  ChatMessagePayload,
  GameStartPayload,
  CombatActionPayload,
  SessionSavePayload,
  SessionLoadPayload,
  SessionPausePayload,
  SessionResumePayload,
} from './types';
import type { RoomManager } from './RoomManager';
import type { ActionQueue } from './ActionQueue';
import { createGameEngineForSession } from '../bootstrap';
import { supabaseAdmin } from '../lib/supabase';
import type { GMResponse } from '../services/game/gmTools';
import type { GameSessionInfo, CharacterInfo } from '../services/context/ContextManager';
import type { SaveManager } from '../services/redis/SaveManager';
import type { PersistenceManager } from '../services/redis/PersistenceManager';

type TypedServer = Server<ClientEvents, ServerEvents, Record<string, never>, SocketData>;
type TypedSocket = Socket<ClientEvents, ServerEvents, Record<string, never>, SocketData>;

/** DB-backed: session_participants에서 세션 멤버 여부 확인 */
export async function isSessionMember(sessionId: string, userId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('session_participants')
    .select('id')
    .eq('session_id', sessionId)
    .eq('user_id', userId)
    .single();

  return !error && !!data;
}

/** DB-backed: game_sessions.created_by로 세션 생성자(GM) 여부 확인 */
export async function isSessionCreator(sessionId: string, userId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('game_sessions')
    .select('created_by')
    .eq('id', sessionId)
    .single();

  return !error && !!data && data.created_by === userId;
}

// roomManager에 이미 있으면 DB 조회 생략, 없으면 DB 체크
async function requireSessionMembership(
  sessionId: string,
  userId: string,
  roomManager: RoomManager,
): Promise<boolean> {
  if (roomManager.isPlayerInRoom(userId, sessionId)) {
    return true;
  }
  return isSessionMember(sessionId, userId);
}

// 주사위 굴림 헬퍼
function rollDice(sides: number): number {
  return Math.floor(Math.random() * sides) + 1;
}

// 주사위 문자열 파싱 (예: "d20" → 20)
function parseDiceSides(dice: string): number {
  const match = dice.match(/d(\d+)/i);
  return match ? parseInt(match[1], 10) : 20;
}

// DB 세션 데이터 → GameSessionInfo 변환
function toSessionInfo(session: Record<string, unknown>): GameSessionInfo {
  return {
    sessionId: session.id as string,
    campaignName: (session.name as string) || '',
    rulebookIds: [],
    setting: (session.game_system as string) || 'dnd5e',
    tone: 'balanced',
  };
}

// DB 캐릭터 데이터 → CharacterInfo[] 변환
// DB 컬럼: hit_points (JSONB), stats (JSONB), abilities (JSONB 배열)
function toCharacterInfos(characters: Record<string, unknown>[]): CharacterInfo[] {
  return characters.map((c) => {
    const hitPoints = (c.hit_points as { current: number; max: number } | null) || {
      current: 10,
      max: 10,
    };

    return {
      characterId: c.id as string,
      name: (c.name as string) || '이름 없음',
      race: (c.race as string) || '',
      class: (c.class as string) || '',
      level: (c.level as number) || 1,
      hp: { current: hitPoints.current, max: hitPoints.max },
      abilities: (c.stats as Record<string, number>) || {},
      skills: (c.abilities as string[]) || [],
      inventory: (c.inventory as string[]) || [],
      conditions: [],
    };
  });
}

// GameEngine을 통해 플레이어 액션 처리
async function processWithGameEngine(
  sessionId: string,
  userId: string,
  message: string,
  characterId?: string,
): Promise<GMResponse> {
  // DB에서 세션 정보 로드
  const { data: session } = await supabaseAdmin
    .from('game_sessions')
    .select('*')
    .eq('id', sessionId)
    .single();

  if (!session) {
    throw new Error('세션을 찾을 수 없습니다.');
  }

  // DB에서 캐릭터 정보 로드
  const { data: characters } = await supabaseAdmin
    .from('characters')
    .select('*')
    .eq('session_id', sessionId);

  // GameEngine 생성 및 액션 처리
  const engine = await createGameEngineForSession(sessionId, userId);

  return engine.processAction(toSessionInfo(session), toCharacterInfos(characters || []), {
    sessionId,
    characterId: characterId || '',
    userId,
    message,
    isOOC: false,
  });
}

// 이벤트 핸들러 등록
export function registerHandlers(
  io: TypedServer,
  socket: TypedSocket,
  roomManager: RoomManager,
  actionQueue: ActionQueue,
  saveManager?: SaveManager,
  persistenceManager?: PersistenceManager,
): void {
  const user = socket.data.user;

  // player:join — 세션 참가 (DB 멤버십 검증)
  socket.on('player:join', async (payload: PlayerJoinPayload) => {
    try {
      const { sessionId, characterId } = payload;

      const isMember = await isSessionMember(sessionId, user.userId);
      if (!isMember) {
        socket.emit('error', {
          code: 'FORBIDDEN',
          message: '이 세션에 참가할 권한이 없습니다.',
        });
        return;
      }

      const result = roomManager.joinRoom(socket.id, sessionId, user.userId, characterId);

      if (!result.success) {
        socket.emit('error', {
          code: 'ROOM_FULL',
          message: result.error ?? '참가에 실패했습니다.',
        });
        return;
      }

      // Socket.io 룸 참가
      socket.join(sessionId);

      // 참가 알림 브로드캐스트 (본인 포함)
      io.to(sessionId).emit('player:joined', {
        sessionId,
        userId: user.userId,
        characterId: characterId ?? '',
        name: user.email ?? '알 수 없는 플레이어',
      });
    } catch (err) {
      socket.emit('error', {
        code: 'JOIN_ERROR',
        message: err instanceof Error ? err.message : '참가 중 오류가 발생했습니다.',
      });
    }
  });

  // player:leave — 세션 퇴장
  socket.on('player:leave', (payload: PlayerLeavePayload) => {
    try {
      const { sessionId } = payload;
      roomManager.leaveRoom(socket.id, sessionId);
      socket.leave(sessionId);

      // 퇴장 알림 브로드캐스트
      io.to(sessionId).emit('player:left', {
        sessionId,
        userId: user.userId,
        name: user.email ?? '알 수 없는 플레이어',
      });
    } catch (err) {
      socket.emit('error', {
        code: 'LEAVE_ERROR',
        message: err instanceof Error ? err.message : '퇴장 중 오류가 발생했습니다.',
      });
    }
  });

  // player:action — 플레이어 액션 (세션 멤버십 검증 후 GameEngine 연동)
  socket.on('player:action', async (payload: PlayerActionPayload) => {
    const { sessionId, message, characterId } = payload;

    const authorized = await requireSessionMembership(sessionId, user.userId, roomManager);
    if (!authorized) {
      socket.emit('error', {
        code: 'FORBIDDEN',
        message: '이 세션에서 액션을 수행할 권한이 없습니다.',
      });
      return;
    }

    // 플레이어 메시지 DB 저장
    void supabaseAdmin
      .from('messages')
      .insert({
        session_id: sessionId,
        sender_type: 'player',
        sender_id: user.userId,
        content: message,
        metadata: { characterId },
      })
      .then(({ error: dbErr }: { error: { message: string } | null }) => {
        if (dbErr) console.error('플레이어 메시지 저장 실패:', dbErr.message);
      });

    actionQueue
      .enqueue(sessionId, async () => {
        return processWithGameEngine(sessionId, user.userId, message, characterId);
      })
      .then((result) => {
        const response = result as GMResponse;

        // GM 응답 브로드캐스트
        io.to(sessionId).emit('gm:response', {
          sessionId,
          response: {
            narrative: response.narrative,
            stateChanges: response.stateChanges || [],
            diceRequests: response.diceRolls || [],
          },
          timestamp: new Date().toISOString(),
        });

        // 상태 변경이 있으면 게임 상태 업데이트도 브로드캐스트
        if (response.stateChanges && response.stateChanges.length > 0) {
          io.to(sessionId).emit('game:stateUpdate', {
            sessionId,
            changes: response.stateChanges,
          });
        }

        // GM 응답 메시지를 DB에 저장
        void supabaseAdmin
          .from('messages')
          .insert({
            session_id: sessionId,
            sender_type: 'gm',
            content: response.narrative,
            metadata: {
              stateChanges: response.stateChanges,
              diceRolls: response.diceRolls,
              rulesApplied: response.rulesApplied,
              sceneTransition: response.sceneTransition,
            },
          })
          .then(({ error: dbErr }: { error: { message: string } | null }) => {
            if (dbErr) console.error('GM 메시지 저장 실패:', dbErr.message);
          });
      })
      .catch((err) => {
        socket.emit('error', {
          code: 'ACTION_ERROR',
          message: err instanceof Error ? err.message : '액션 처리 중 오류가 발생했습니다.',
        });
      });
  });

  // dice:roll — 주사위 굴림 (세션 멤버십 검증)
  socket.on('dice:roll', async (payload: DiceRollPayload) => {
    try {
      const { sessionId, dice, count, modifier, reason } = payload;

      const authorized = await requireSessionMembership(sessionId, user.userId, roomManager);
      if (!authorized) {
        socket.emit('error', {
          code: 'FORBIDDEN',
          message: '이 세션에서 주사위를 굴릴 권한이 없습니다.',
        });
        return;
      }

      const sides = parseDiceSides(dice);
      const rollCount = Math.min(Math.max(count, 1), 100); // 1~100개 제한

      const rolls: number[] = [];
      for (let i = 0; i < rollCount; i++) {
        rolls.push(rollDice(sides));
      }

      const total = rolls.reduce((sum, r) => sum + r, 0) + modifier;

      // 결과 브로드캐스트
      io.to(sessionId).emit('dice:result', {
        sessionId,
        userId: user.userId,
        dice,
        count: rollCount,
        modifier,
        rolls,
        total,
        reason,
      });
    } catch (err) {
      socket.emit('error', {
        code: 'DICE_ERROR',
        message: err instanceof Error ? err.message : '주사위 굴림 중 오류가 발생했습니다.',
      });
    }
  });

  // chat:message — 채팅 메시지 (세션 멤버십 검증)
  socket.on('chat:message', async (payload: ChatMessagePayload) => {
    try {
      const { sessionId, content, isOOC } = payload;

      const authorized = await requireSessionMembership(sessionId, user.userId, roomManager);
      if (!authorized) {
        socket.emit('error', { code: 'FORBIDDEN', message: '이 세션에서 채팅할 권한이 없습니다.' });
        return;
      }

      // 플레이어 메시지 DB 저장 (OOC/IC 모두)
      void supabaseAdmin
        .from('messages')
        .insert({
          session_id: sessionId,
          sender_type: 'player',
          sender_id: user.userId,
          content,
          is_ooc: isOOC,
        })
        .then(({ error: dbErr }: { error: { message: string } | null }) => {
          if (dbErr) console.error('채팅 메시지 저장 실패:', dbErr.message);
        });

      if (isOOC) {
        // OOC 메시지: 단순 채팅 중계 (GM 개입 없음)
        io.to(sessionId).emit('gm:response', {
          sessionId,
          response: {
            narrative: content,
            stateChanges: [],
          },
          timestamp: new Date().toISOString(),
        });
      } else {
        // IC 메시지: GameEngine으로 처리 (player:action과 동일)
        actionQueue
          .enqueue(sessionId, async () => {
            return processWithGameEngine(sessionId, user.userId, content);
          })
          .then((result) => {
            const response = result as GMResponse;
            io.to(sessionId).emit('gm:response', {
              sessionId,
              response: {
                narrative: response.narrative,
                stateChanges: response.stateChanges || [],
                diceRequests: response.diceRolls || [],
              },
              timestamp: new Date().toISOString(),
            });

            // GM 응답 DB 저장
            void supabaseAdmin
              .from('messages')
              .insert({
                session_id: sessionId,
                sender_type: 'gm',
                content: response.narrative,
                metadata: {
                  stateChanges: response.stateChanges,
                  diceRequests: response.diceRolls,
                },
              })
              .then(({ error: dbErr }: { error: { message: string } | null }) => {
                if (dbErr) console.error('GM 메시지 저장 실패:', dbErr.message);
              });
          })
          .catch((err) => {
            socket.emit('error', {
              code: 'CHAT_ERROR',
              message: err instanceof Error ? err.message : '채팅 처리 중 오류가 발생했습니다.',
            });
          });
      }
    } catch (err) {
      socket.emit('error', {
        code: 'CHAT_ERROR',
        message: err instanceof Error ? err.message : '채팅 전송 중 오류가 발생했습니다.',
      });
    }
  });

  // game:start — 게임 시작 (세션 생성자/GM만 허용)
  socket.on('game:start', async (payload: GameStartPayload) => {
    try {
      const { sessionId } = payload;

      const isCreator = await isSessionCreator(sessionId, user.userId);
      if (!isCreator) {
        socket.emit('error', {
          code: 'FORBIDDEN',
          message: '게임을 시작할 권한이 없습니다. 세션 생성자만 시작할 수 있습니다.',
        });
        return;
      }

      // 게임 상태 업데이트 브로드캐스트
      io.to(sessionId).emit('game:stateUpdate', {
        sessionId,
        changes: [{ type: 'gameStarted' }],
      });
    } catch (err) {
      socket.emit('error', {
        code: 'START_ERROR',
        message: err instanceof Error ? err.message : '게임 시작 중 오류가 발생했습니다.',
      });
    }
  });

  // combat:action — 전투 액션 (세션 멤버십 검증 후 GameEngine으로 전달)
  socket.on('combat:action', async (payload: CombatActionPayload) => {
    try {
      const { sessionId, action } = payload;

      const authorized = await requireSessionMembership(sessionId, user.userId, roomManager);
      if (!authorized) {
        socket.emit('error', {
          code: 'FORBIDDEN',
          message: '이 세션에서 전투 액션을 수행할 권한이 없습니다.',
        });
        return;
      }

      // 전투 액션을 GameEngine으로 전달
      actionQueue
        .enqueue(sessionId, async () => {
          return processWithGameEngine(sessionId, user.userId, `전투 액션: ${action}`);
        })
        .then((result) => {
          const response = result as GMResponse;
          io.to(sessionId).emit('gm:response', {
            sessionId,
            response: {
              narrative: response.narrative,
              stateChanges: response.stateChanges || [],
              diceRequests: response.diceRolls || [],
            },
            timestamp: new Date().toISOString(),
          });

          // 상태 변경 브로드캐스트
          if (response.stateChanges && response.stateChanges.length > 0) {
            io.to(sessionId).emit('combat:update', {
              sessionId,
              combatState: {
                stateChanges: response.stateChanges,
                status: 'active',
              },
            });
          }
        })
        .catch((err) => {
          socket.emit('error', {
            code: 'COMBAT_ERROR',
            message: err instanceof Error ? err.message : '전투 액션 처리 중 오류가 발생했습니다.',
          });
        });
    } catch (err) {
      socket.emit('error', {
        code: 'COMBAT_ERROR',
        message: err instanceof Error ? err.message : '전투 액션 처리 중 오류가 발생했습니다.',
      });
    }
  });

  // ─── 세이브/로드/일시정지/재개 이벤트 ──────────────────

  // session:save — 수동 세이브
  socket.on('session:save', async (payload: SessionSavePayload) => {
    try {
      const { sessionId, name } = payload;

      const authorized = await requireSessionMembership(sessionId, user.userId, roomManager);
      if (!authorized) {
        socket.emit('error', {
          code: 'FORBIDDEN',
          message: '이 세션에서 세이브할 권한이 없습니다.',
        });
        return;
      }

      if (!saveManager) {
        socket.emit('error', { code: 'SAVE_ERROR', message: '세이브 기능이 비활성화되어 있습니다.' });
        return;
      }

      const result = await saveManager.save(sessionId, user.userId, name);

      io.to(sessionId).emit('session:saveComplete', {
        sessionId,
        savePointId: result.id,
        saveType: 'manual' as const,
        name: result.name,
        timestamp: result.createdAt,
      });
    } catch (err) {
      socket.emit('error', {
        code: 'SAVE_ERROR',
        message: err instanceof Error ? err.message : '세이브 중 오류가 발생했습니다.',
      });
    }
  });

  // session:load — 세이브 로드
  socket.on('session:load', async (payload: SessionLoadPayload) => {
    try {
      const { sessionId, savePointId } = payload;

      const authorized = await requireSessionMembership(sessionId, user.userId, roomManager);
      if (!authorized) {
        socket.emit('error', {
          code: 'FORBIDDEN',
          message: '이 세션에서 로드할 권한이 없습니다.',
        });
        return;
      }

      if (!saveManager) {
        socket.emit('error', { code: 'LOAD_ERROR', message: '로드 기능이 비활성화되어 있습니다.' });
        return;
      }

      const snapshot = await saveManager.load(sessionId, savePointId);

      io.to(sessionId).emit('session:loadComplete', {
        sessionId,
        savePointId,
        snapshot,
      });
    } catch (err) {
      socket.emit('error', {
        code: 'LOAD_ERROR',
        message: err instanceof Error ? err.message : '로드 중 오류가 발생했습니다.',
      });
    }
  });

  // session:pause — 일시정지
  socket.on('session:pause', async (payload: SessionPausePayload) => {
    try {
      const { sessionId } = payload;

      const isCreator = await isSessionCreator(sessionId, user.userId);
      if (!isCreator) {
        socket.emit('error', {
          code: 'FORBIDDEN',
          message: '세션 생성자만 일시정지할 수 있습니다.',
        });
        return;
      }

      if (!saveManager || !persistenceManager) {
        socket.emit('error', { code: 'PAUSE_ERROR', message: '일시정지 기능이 비활성화되어 있습니다.' });
        return;
      }

      const saveResult = await saveManager.savePause(sessionId, user.userId);

      await supabaseAdmin
        .from('game_sessions')
        .update({ status: 'paused', updated_at: new Date().toISOString() })
        .eq('id', sessionId);

      await persistenceManager.flushSession(sessionId);

      io.to(sessionId).emit('session:paused', {
        sessionId,
        savePointId: saveResult.id,
        pausedBy: user.userId,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      socket.emit('error', {
        code: 'PAUSE_ERROR',
        message: err instanceof Error ? err.message : '일시정지 중 오류가 발생했습니다.',
      });
    }
  });

  // session:resume — 재개
  socket.on('session:resume', async (payload: SessionResumePayload) => {
    try {
      const { sessionId } = payload;

      const isCreator = await isSessionCreator(sessionId, user.userId);
      if (!isCreator) {
        socket.emit('error', {
          code: 'FORBIDDEN',
          message: '세션 생성자만 재개할 수 있습니다.',
        });
        return;
      }

      if (!persistenceManager) {
        socket.emit('error', { code: 'RESUME_ERROR', message: '재개 기능이 비활성화되어 있습니다.' });
        return;
      }

      await supabaseAdmin
        .from('game_sessions')
        .update({ status: 'active', updated_at: new Date().toISOString() })
        .eq('id', sessionId);

      await persistenceManager.loadSession(sessionId);

      io.to(sessionId).emit('session:resumed', {
        sessionId,
        resumedBy: user.userId,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      socket.emit('error', {
        code: 'RESUME_ERROR',
        message: err instanceof Error ? err.message : '재개 중 오류가 발생했습니다.',
      });
    }
  });

  // 연결 종료 시 모든 방에서 퇴장
  socket.on('disconnect', () => {
    const leftRooms = roomManager.leaveAllRooms(socket.id);
    for (const { sessionId, userId } of leftRooms) {
      io.to(sessionId).emit('player:left', {
        sessionId,
        userId,
        name: user.email ?? '알 수 없는 플레이어',
      });
    }
  });
}
