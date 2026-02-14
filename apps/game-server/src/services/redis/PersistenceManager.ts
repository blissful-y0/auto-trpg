// 영속화 매니저 — Redis ↔ Supabase 주기적 동기화

import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../../lib/supabase';
import { SessionStateStore } from './SessionStateStore';
import { SaveManager } from './SaveManager';
import { PERSIST_INTERVAL, type SessionState, type CharacterState, type DirtyState } from './types';

export class PersistenceManager {
  private store: SessionStateStore;
  private supabase: SupabaseClient;
  private dirtyMap: Map<string, DirtyState> = new Map();
  private timers: Map<string, ReturnType<typeof setInterval>> = new Map();
  private saveManager: SaveManager | null;

  constructor(store?: SessionStateStore, supabase?: SupabaseClient, saveManager?: SaveManager) {
    this.store = store ?? new SessionStateStore();
    this.supabase = supabase ?? supabaseAdmin;
    this.saveManager = saveManager ?? null;
  }

  // ─── 세션 시작: Supabase → Redis 로드 ─────────────

  async loadSession(sessionId: string): Promise<void> {
    // 세션 기본 정보 로드
    // 소프트 삭제된 세션 제외
    const { data: session, error: sessionErr } = await this.supabase
      .from('game_sessions')
      .select('*')
      .eq('id', sessionId)
      .is('deleted_at', null)
      .single();

    if (sessionErr || !session) {
      throw new Error(`세션 로드 실패: ${sessionErr?.message ?? '세션을 찾을 수 없습니다.'}`);
    }

    // Redis에 세션 상태 저장
    const state: SessionState = {
      sessionId: session.id,
      status: session.status,
      gameSystem: session.game_system,
      currentScene: session.current_scene ?? 1,
      worldState: session.world_state ?? {},
      settings: session.settings ?? {},
      updatedAt: new Date().toISOString(),
    };
    await this.store.setSessionState(sessionId, state);

    // 캐릭터 로드
    // 소프트 삭제된 캐릭터 제외
    const { data: characters } = await this.supabase
      .from('characters')
      .select('*')
      .eq('session_id', sessionId)
      .eq('status', 'active')
      .is('deleted_at', null);

    if (characters) {
      for (const char of characters) {
        const charState: CharacterState = {
          characterId: char.id,
          name: char.name,
          race: char.race ?? '',
          class: char.class ?? '',
          level: char.level ?? 1,
          hpCurrent: char.hit_points?.current ?? 10,
          hpMax: char.hit_points?.max ?? 10,
          hpTemp: char.hit_points?.temp ?? 0,
          armorClass: char.armor_class ?? 10,
          inventory: JSON.stringify(char.inventory ?? []),
          abilities: JSON.stringify(char.abilities ?? []),
          conditions: JSON.stringify([]),
          status: char.status ?? 'active',
        };
        await this.store.setCharacter(sessionId, charState);
      }
    }

    // 활성 세션 등록
    await this.store.registerActiveSession(sessionId);

    // dirty 상태 초기화
    this.dirtyMap.set(sessionId, {
      sessionState: false,
      characters: new Set(),
      combat: false,
      messages: false,
    });

    // 주기적 영속화 타이머 시작
    this.startPersistTimer(sessionId);

    // 자동 세이브 시작
    if (this.saveManager) {
      this.saveManager.startAutoSave(sessionId, session.created_by);
    }

    console.log(`[PersistenceManager] 세션 ${sessionId} 로드 완료`);
  }

  // ─── dirty 플래그 설정 ─────────────────────────────

  markDirty(sessionId: string, field: keyof Omit<DirtyState, 'characters'>): void {
    const dirty = this.dirtyMap.get(sessionId);
    if (dirty) {
      dirty[field] = true;
    }
  }

  markCharacterDirty(sessionId: string, characterId: string): void {
    const dirty = this.dirtyMap.get(sessionId);
    if (dirty) {
      dirty.characters.add(characterId);
    }
  }

  // ─── 주기적 영속화 ────────────────────────────────

  private startPersistTimer(sessionId: string): void {
    // 기존 타이머 정리
    this.stopPersistTimer(sessionId);

    const timer = setInterval(() => {
      this.persistDelta(sessionId).catch((err) => {
        console.error(`[PersistenceManager] 영속화 실패 (${sessionId}):`, err);
      });
    }, PERSIST_INTERVAL);

    this.timers.set(sessionId, timer);
  }

  private stopPersistTimer(sessionId: string): void {
    const timer = this.timers.get(sessionId);
    if (timer) {
      clearInterval(timer);
      this.timers.delete(sessionId);
    }
  }

  // ─── 델타 영속화 (dirty 데이터만) ─────────────────

  async persistDelta(sessionId: string): Promise<void> {
    const dirty = this.dirtyMap.get(sessionId);
    if (!dirty) return;

    // 세션 상태 영속화
    if (dirty.sessionState) {
      const state = await this.store.getSessionState(sessionId);
      if (state) {
        await this.supabase
          .from('game_sessions')
          .update({
            status: state.status,
            current_scene: state.currentScene,
            world_state: state.worldState,
            settings: state.settings,
            updated_at: new Date().toISOString(),
          })
          .eq('id', sessionId);
      }
      dirty.sessionState = false;
    }

    // 캐릭터 영속화 (dirty인 것만)
    if (dirty.characters.size > 0) {
      for (const characterId of dirty.characters) {
        const char = await this.store.getCharacter(sessionId, characterId);
        if (char) {
          await this.supabase
            .from('characters')
            .update({
              name: char.name,
              race: char.race,
              class: char.class,
              level: char.level,
              hit_points: {
                current: char.hpCurrent,
                max: char.hpMax,
                temp: char.hpTemp,
              },
              armor_class: char.armorClass,
              inventory: JSON.parse(char.inventory),
              abilities: JSON.parse(char.abilities),
              status: char.status,
              updated_at: new Date().toISOString(),
            })
            .eq('id', characterId);
        }
      }
      dirty.characters.clear();
    }

    // 전투 상태는 Redis에서만 관리 (별도 영속화 불필요, 스냅샷으로 처리)
    dirty.combat = false;
    dirty.messages = false;
  }

  // ─── 세션 종료: Redis → Supabase flush ─────────────

  async flushSession(sessionId: string): Promise<void> {
    // 자동 세이브 중지
    if (this.saveManager) {
      this.saveManager.stopAutoSave(sessionId);
    }

    // 모든 dirty 플래그를 true로 설정하여 전체 영속화
    const dirty = this.dirtyMap.get(sessionId);
    if (dirty) {
      dirty.sessionState = true;
      const characters = await this.store.getAllCharacters(sessionId);
      for (const char of characters) {
        dirty.characters.add(char.characterId);
      }
    }

    // 영속화 실행
    await this.persistDelta(sessionId);

    // 타이머 정리
    this.stopPersistTimer(sessionId);

    // Redis 데이터 정리
    await this.store.clearSession(sessionId);

    // dirty 맵 정리
    this.dirtyMap.delete(sessionId);

    console.log(`[PersistenceManager] 세션 ${sessionId} flush 완료`);
  }

  // ─── Graceful Shutdown: 모든 활성 세션 flush ──────

  async shutdownAll(): Promise<void> {
    console.log('[PersistenceManager] 전체 종료 시작...');

    const activeSessions = await this.store.getActiveSessions();

    for (const sessionId of activeSessions) {
      try {
        await this.flushSession(sessionId);
      } catch (err) {
        console.error(`[PersistenceManager] 세션 ${sessionId} flush 실패:`, err);
      }
    }

    // 모든 타이머 정리
    for (const [, timer] of this.timers) {
      clearInterval(timer);
    }
    this.timers.clear();
    this.dirtyMap.clear();

    // SaveManager 종료
    if (this.saveManager) {
      await this.saveManager.shutdownAll();
    }

    console.log('[PersistenceManager] 전체 종료 완료');
  }

  // ─── 상태 조회 ────────────────────────────────────

  // 세션의 dirty 상태 확인
  isDirty(sessionId: string): boolean {
    const dirty = this.dirtyMap.get(sessionId);
    if (!dirty) return false;
    return dirty.sessionState || dirty.characters.size > 0 || dirty.combat || dirty.messages;
  }

  // 관리 중인 세션 수
  get activeSessionCount(): number {
    return this.dirtyMap.size;
  }
}
