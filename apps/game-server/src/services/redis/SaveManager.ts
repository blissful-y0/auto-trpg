// 세이브 매니저 — 스냅샷 생성, 복원, 자동 세이브 관리

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Server } from 'socket.io';
import { supabaseAdmin } from '../../lib/supabase';
import { SessionStateStore } from './SessionStateStore';
import {
  AUTO_SAVE_INTERVAL,
  MAX_AUTO_SAVES,
  type SessionState,
  type CharacterState,
  type CombatState,
  type RedisMessage,
} from './types';

// ─── 스냅샷 타입 (서버 내부용) ──────────────────────────

interface SavePointSnapshot {
  sessionState: {
    sessionId: string;
    status: string;
    gameSystem: string;
    currentScene: number;
    worldState: Record<string, unknown>;
    settings: Record<string, unknown>;
  };
  characters: Array<{
    characterId: string;
    name: string;
    race: string;
    class: string;
    level: number;
    hpCurrent: number;
    hpMax: number;
    hpTemp: number;
    armorClass: number;
    inventory: string;
    abilities: string;
    conditions: string;
    status: string;
  }>;
  combat: {
    isActive: boolean;
    round: number;
    currentTurnIndex: number;
    combatants: unknown[];
    startedAt: string;
  } | null;
  recentMessages: Array<{
    id: string;
    senderId?: string;
    senderType: string;
    content: string;
    isOOC: boolean;
    createdAt: string;
  }>;
  savedAt: string;
}

interface SavePointSummary {
  id: string;
  sessionId: string;
  saveType: 'manual' | 'auto' | 'pause';
  name: string;
  sceneNumber: number;
  characterCount: number;
  createdBy: string;
  createdAt: string;
}

interface SavePointFull extends SavePointSummary {
  snapshot: SavePointSnapshot;
}

// 동시 세이브 방지를 위한 Promise 락
type SaveLock = { promise: Promise<void>; resolve: () => void } | null;

export class SaveManager {
  private store: SessionStateStore;
  private supabase: SupabaseClient;
  private autoSaveTimers: Map<string, ReturnType<typeof setInterval>> = new Map();
  private saveLocks: Map<string, SaveLock> = new Map();
  private io: Server | null = null;

  constructor(store?: SessionStateStore, supabase?: SupabaseClient) {
    this.store = store ?? new SessionStateStore();
    this.supabase = supabase ?? supabaseAdmin;
  }

  // Socket.io 서버 인스턴스 설정 (자동 세이브 인디케이터 브로드캐스트용)
  setIO(io: Server): void {
    this.io = io;
  }

  // ─── 동시 세이브 방지 락 ────────────────────────────

  private async acquireLock(sessionId: string): Promise<void> {
    const existing = this.saveLocks.get(sessionId);
    if (existing) {
      await existing.promise;
    }

    let resolveFn: () => void;
    const promise = new Promise<void>((resolve) => {
      resolveFn = resolve;
    });
    this.saveLocks.set(sessionId, { promise, resolve: resolveFn! });
  }

  private releaseLock(sessionId: string): void {
    const lock = this.saveLocks.get(sessionId);
    if (lock) {
      lock.resolve();
      this.saveLocks.delete(sessionId);
    }
  }

  // ─── 스냅샷 생성 ────────────────────────────────────

  // Redis 상태를 읽어 전체 스냅샷 객체 생성
  async createSnapshot(sessionId: string): Promise<SavePointSnapshot> {
    const [sessionState, characters, combat, messages] = await Promise.all([
      this.store.getSessionState(sessionId),
      this.store.getAllCharacters(sessionId),
      this.store.getCombatState(sessionId),
      this.store.getRecentMessages(sessionId, 50),
    ]);

    if (!sessionState) {
      throw new Error(`세션 상태를 찾을 수 없습니다: ${sessionId}`);
    }

    return {
      sessionState: {
        sessionId: sessionState.sessionId,
        status: sessionState.status,
        gameSystem: sessionState.gameSystem,
        currentScene: sessionState.currentScene,
        worldState: sessionState.worldState,
        settings: sessionState.settings,
      },
      characters: characters.map((c: CharacterState) => ({
        characterId: c.characterId,
        name: c.name,
        race: c.race,
        class: c.class,
        level: c.level,
        hpCurrent: c.hpCurrent,
        hpMax: c.hpMax,
        hpTemp: c.hpTemp,
        armorClass: c.armorClass,
        inventory: c.inventory,
        abilities: c.abilities,
        conditions: c.conditions,
        status: c.status,
      })),
      combat: combat
        ? {
            isActive: combat.isActive,
            round: combat.round,
            currentTurnIndex: combat.currentTurnIndex,
            combatants: combat.combatants,
            startedAt: combat.startedAt,
          }
        : null,
      recentMessages: messages.map((m: RedisMessage) => ({
        id: m.id,
        senderId: m.senderId,
        senderType: m.senderType,
        content: m.content,
        isOOC: m.isOOC,
        createdAt: m.createdAt,
      })),
      savedAt: new Date().toISOString(),
    };
  }

  // ─── 수동 세이브 ────────────────────────────────────

  async save(
    sessionId: string,
    userId: string,
    name?: string,
  ): Promise<{ id: string; saveType: string; name: string; createdAt: string }> {
    await this.acquireLock(sessionId);
    try {
      const snapshot = await this.createSnapshot(sessionId);
      const saveName = name || `수동 세이브 — 장면 ${snapshot.sessionState.currentScene}`;

      const { data, error } = await this.supabase
        .from('save_points')
        .insert({
          session_id: sessionId,
          save_type: 'manual',
          name: saveName,
          snapshot,
          scene_number: snapshot.sessionState.currentScene,
          character_count: snapshot.characters.length,
          created_by: userId,
        })
        .select('id, save_type, name, created_at')
        .single();

      if (error || !data) {
        throw new Error(`세이브포인트 저장 실패: ${error?.message}`);
      }

      console.log(`[SaveManager] 수동 세이브 완료: ${data.id} (${sessionId})`);

      return {
        id: data.id,
        saveType: data.save_type,
        name: data.name,
        createdAt: data.created_at,
      };
    } finally {
      this.releaseLock(sessionId);
    }
  }

  // ─── 일시정지 세이브 ────────────────────────────────

  async savePause(
    sessionId: string,
    userId: string,
  ): Promise<{ id: string; saveType: string; name: string; createdAt: string }> {
    await this.acquireLock(sessionId);
    try {
      const snapshot = await this.createSnapshot(sessionId);
      const saveName = `일시정지 — 장면 ${snapshot.sessionState.currentScene}`;

      const { data, error } = await this.supabase
        .from('save_points')
        .insert({
          session_id: sessionId,
          save_type: 'pause',
          name: saveName,
          snapshot,
          scene_number: snapshot.sessionState.currentScene,
          character_count: snapshot.characters.length,
          created_by: userId,
        })
        .select('id, save_type, name, created_at')
        .single();

      if (error || !data) {
        throw new Error(`일시정지 세이브 실패: ${error?.message}`);
      }

      console.log(`[SaveManager] 일시정지 세이브 완료: ${data.id} (${sessionId})`);

      return {
        id: data.id,
        saveType: data.save_type,
        name: data.name,
        createdAt: data.created_at,
      };
    } finally {
      this.releaseLock(sessionId);
    }
  }

  // ─── 자동 세이브 ────────────────────────────────────

  startAutoSave(sessionId: string, userId: string): void {
    this.stopAutoSave(sessionId);

    const timer = setInterval(() => {
      this.autoSave(sessionId, userId).catch((err) => {
        console.error(`[SaveManager] 자동 세이브 실패 (${sessionId}):`, err);
      });
    }, AUTO_SAVE_INTERVAL);

    this.autoSaveTimers.set(sessionId, timer);
    console.log(`[SaveManager] 자동 세이브 시작: ${sessionId} (${AUTO_SAVE_INTERVAL / 1000}초 간격)`);
  }

  stopAutoSave(sessionId: string): void {
    const timer = this.autoSaveTimers.get(sessionId);
    if (timer) {
      clearInterval(timer);
      this.autoSaveTimers.delete(sessionId);
      console.log(`[SaveManager] 자동 세이브 중지: ${sessionId}`);
    }
  }

  private async autoSave(sessionId: string, userId: string): Promise<void> {
    await this.acquireLock(sessionId);
    try {
      // 자동 세이브 시작 알림
      this.emitAutoSaveIndicator(sessionId, 'saving');

      const snapshot = await this.createSnapshot(sessionId);
      const saveName = `자동 세이브 — 장면 ${snapshot.sessionState.currentScene}`;

      const { error } = await this.supabase
        .from('save_points')
        .insert({
          session_id: sessionId,
          save_type: 'auto',
          name: saveName,
          snapshot,
          scene_number: snapshot.sessionState.currentScene,
          character_count: snapshot.characters.length,
          created_by: userId,
        });

      if (error) {
        this.emitAutoSaveIndicator(sessionId, 'error');
        throw new Error(`자동 세이브 실패: ${error.message}`);
      }

      // 오래된 자동 세이브 정리
      await this.pruneAutoSaves(sessionId);

      // 완료 알림
      this.emitAutoSaveIndicator(sessionId, 'saved');
      console.log(`[SaveManager] 자동 세이브 완료: ${sessionId}`);
    } finally {
      this.releaseLock(sessionId);
    }
  }

  private async pruneAutoSaves(sessionId: string): Promise<void> {
    // 자동 세이브만 날짜 내림차순으로 조회 (소프트 삭제된 세이브 제외)
    const { data: autoSaves } = await this.supabase
      .from('save_points')
      .select('id')
      .eq('session_id', sessionId)
      .eq('save_type', 'auto')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (!autoSaves || autoSaves.length <= MAX_AUTO_SAVES) return;

    // 최대 개수 초과분 삭제
    const toDelete = autoSaves
      .slice(MAX_AUTO_SAVES)
      .map((s: { id: string }) => s.id);

    if (toDelete.length > 0) {
      await this.supabase
        .from('save_points')
        .update({ deleted_at: new Date().toISOString() })
        .in('id', toDelete);

      console.log(`[SaveManager] 오래된 자동 세이브 ${toDelete.length}개 정리 (${sessionId})`);
    }
  }

  private emitAutoSaveIndicator(
    sessionId: string,
    status: 'saving' | 'saved' | 'error',
  ): void {
    if (this.io) {
      this.io.to(sessionId).emit('session:autoSaveIndicator', {
        sessionId,
        status,
        timestamp: new Date().toISOString(),
      });
    }
  }

  // ─── 로드 (복원) ────────────────────────────────────

  async load(sessionId: string, savePointId: string): Promise<SavePointSnapshot> {
    await this.acquireLock(sessionId);
    try {
      // 세이브포인트 조회 (소프트 삭제된 세이브 제외)
      const { data, error } = await this.supabase
        .from('save_points')
        .select('*')
        .eq('id', savePointId)
        .eq('session_id', sessionId)
        .is('deleted_at', null)
        .single();

      if (error || !data) {
        throw new Error(`세이브포인트를 찾을 수 없습니다: ${savePointId}`);
      }

      const snapshot = data.snapshot as SavePointSnapshot;

      // 스냅샷을 Redis에 적용
      await this.applySnapshot(sessionId, snapshot);

      // Supabase에도 현재 상태 동기화
      await this.syncToSupabase(sessionId, snapshot);

      console.log(`[SaveManager] 세이브포인트 로드 완료: ${savePointId} (${sessionId})`);

      return snapshot;
    } finally {
      this.releaseLock(sessionId);
    }
  }

  private async applySnapshot(
    sessionId: string,
    snapshot: SavePointSnapshot,
  ): Promise<void> {
    // 1. 세션 상태 복원
    const sessionState: SessionState = {
      sessionId: snapshot.sessionState.sessionId,
      status: snapshot.sessionState.status as SessionState['status'],
      gameSystem: snapshot.sessionState.gameSystem,
      currentScene: snapshot.sessionState.currentScene,
      worldState: snapshot.sessionState.worldState,
      settings: snapshot.sessionState.settings,
      updatedAt: new Date().toISOString(),
    };
    await this.store.setSessionState(sessionId, sessionState);

    // 2. 기존 캐릭터 데이터 삭제 후 스냅샷 캐릭터 복원
    const existingChars = await this.store.getAllCharacters(sessionId);
    for (const char of existingChars) {
      await this.store.removeCharacter(sessionId, char.characterId);
    }

    for (const char of snapshot.characters) {
      const charState: CharacterState = {
        characterId: char.characterId,
        name: char.name,
        race: char.race,
        class: char.class,
        level: char.level,
        hpCurrent: char.hpCurrent,
        hpMax: char.hpMax,
        hpTemp: char.hpTemp,
        armorClass: char.armorClass,
        inventory: char.inventory,
        abilities: char.abilities,
        conditions: char.conditions,
        status: char.status as CharacterState['status'],
      };
      await this.store.setCharacter(sessionId, charState);
    }

    // 3. 전투 상태 복원
    if (snapshot.combat) {
      const combatState: CombatState = {
        isActive: snapshot.combat.isActive,
        round: snapshot.combat.round,
        currentTurnIndex: snapshot.combat.currentTurnIndex,
        combatants: snapshot.combat.combatants as CombatState['combatants'],
        startedAt: snapshot.combat.startedAt,
      };
      await this.store.setCombatState(sessionId, combatState);
    } else {
      await this.store.clearCombatState(sessionId);
    }
  }

  private async syncToSupabase(
    sessionId: string,
    snapshot: SavePointSnapshot,
  ): Promise<void> {
    // 세션 기본 상태 동기화
    await this.supabase
      .from('game_sessions')
      .update({
        status: snapshot.sessionState.status,
        current_scene: snapshot.sessionState.currentScene,
        world_state: snapshot.sessionState.worldState,
        settings: snapshot.sessionState.settings,
        updated_at: new Date().toISOString(),
      })
      .eq('id', sessionId);

    // 캐릭터 상태 동기화
    for (const char of snapshot.characters) {
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
        .eq('id', char.characterId);
    }
  }

  // ─── 세이브포인트 조회 ──────────────────────────────

  async listSavePoints(sessionId: string): Promise<SavePointSummary[]> {
    // 소프트 삭제된 세이브 제외
    const { data, error } = await this.supabase
      .from('save_points')
      .select('id, session_id, save_type, name, scene_number, character_count, created_by, created_at')
      .eq('session_id', sessionId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`세이브포인트 목록 조회 실패: ${error.message}`);
    }

    return (data || []).map((row: Record<string, unknown>) => ({
      id: row.id as string,
      sessionId: row.session_id as string,
      saveType: row.save_type as 'manual' | 'auto' | 'pause',
      name: row.name as string,
      sceneNumber: row.scene_number as number,
      characterCount: row.character_count as number,
      createdBy: row.created_by as string,
      createdAt: row.created_at as string,
    }));
  }

  async getSavePoint(savePointId: string): Promise<SavePointFull | null> {
    // 소프트 삭제된 세이브 제외
    const { data, error } = await this.supabase
      .from('save_points')
      .select('*')
      .eq('id', savePointId)
      .is('deleted_at', null)
      .single();

    if (error || !data) return null;

    return {
      id: data.id,
      sessionId: data.session_id,
      saveType: data.save_type,
      name: data.name,
      snapshot: data.snapshot as SavePointSnapshot,
      sceneNumber: data.scene_number,
      characterCount: data.character_count,
      createdBy: data.created_by,
      createdAt: data.created_at,
    };
  }

  // ─── 세이브포인트 삭제 ──────────────────────────────

  async deleteSavePoint(savePointId: string, sessionId: string): Promise<void> {
    const { error } = await this.supabase
      .from('save_points')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', savePointId)
      .eq('session_id', sessionId);

    if (error) {
      throw new Error(`세이브포인트 삭제 실패: ${error.message}`);
    }
  }

  // ─── Graceful Shutdown ──────────────────────────────

  async shutdownAll(): Promise<void> {
    console.log('[SaveManager] 전체 종료 시작...');

    for (const [sessionId, timer] of this.autoSaveTimers) {
      clearInterval(timer);
      console.log(`[SaveManager] 자동 세이브 타이머 정리: ${sessionId}`);
    }

    this.autoSaveTimers.clear();
    this.saveLocks.clear();

    console.log('[SaveManager] 전체 종료 완료');
  }
}
