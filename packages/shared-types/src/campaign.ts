// 캠페인 & 세이브포인트 타입 정의

import type { GameSessionId, UserId } from './game';

// ─── 캠페인 ───────────────────────────────────────────

export type CampaignId = string;
export type SavePointId = string;

export type CampaignStatus = 'active' | 'completed' | 'archived';
export type SaveType = 'manual' | 'auto' | 'pause';

/** 캠페인 */
export interface Campaign {
  id: CampaignId;
  name: string;
  description: string;
  gameSystem: string;
  createdBy: UserId;
  worldState: Record<string, unknown>;
  settings: Record<string, unknown>;
  status: CampaignStatus;
  createdAt: string;
  updatedAt: string;
}

/** 캠페인 세션 요약 (목록용) */
export interface CampaignSessionSummary {
  id: GameSessionId;
  name: string;
  status: string;
  sessionOrder: number;
  createdAt: string;
  updatedAt: string;
}

/** 캠페인 + 세션 목록 (상세 조회용) */
export interface CampaignWithSessions extends Campaign {
  sessions: CampaignSessionSummary[];
}

// ─── 세이브포인트 ──────────────────────────────────────

/** Redis 상태의 전체 스냅샷 */
export interface SavePointSnapshot {
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

/** 세이브포인트 (전체) */
export interface SavePoint {
  id: SavePointId;
  sessionId: GameSessionId;
  saveType: SaveType;
  name: string;
  snapshot: SavePointSnapshot;
  sceneNumber: number;
  characterCount: number;
  createdBy: UserId;
  createdAt: string;
}

/** 세이브포인트 요약 (목록 조회용, 스냅샷 제외) */
export interface SavePointSummary {
  id: SavePointId;
  sessionId: GameSessionId;
  saveType: SaveType;
  name: string;
  sceneNumber: number;
  characterCount: number;
  createdBy: UserId;
  createdAt: string;
}
