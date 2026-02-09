// 방(Room) 관리 — 세션별 플레이어 입퇴장, 인원 제한

import type { RoomInfo, RoomPlayer } from './types';

// 기본 최대 플레이어 수
const DEFAULT_MAX_PLAYERS = 6;

export class RoomManager {
  private rooms: Map<string, RoomInfo> = new Map();

  // 방 참가
  joinRoom(
    socketId: string,
    sessionId: string,
    userId: string,
    characterId?: string,
  ): { success: boolean; error?: string } {
    let room = this.rooms.get(sessionId);

    // 방이 없으면 새로 생성
    if (!room) {
      room = {
        sessionId,
        players: new Map(),
        maxPlayers: DEFAULT_MAX_PLAYERS,
        createdAt: new Date(),
      };
      this.rooms.set(sessionId, room);
    }

    // 이미 참가 중인 플레이어 → 재연결 처리 (소켓ID 갱신)
    const existingPlayer = Array.from(room.players.entries()).find(
      ([, p]) => p.userId === userId,
    );

    if (existingPlayer) {
      const [oldSocketId] = existingPlayer;
      room.players.delete(oldSocketId);
      room.players.set(socketId, { userId, characterId, socketId });
      return { success: true };
    }

    // 최대 인원 체크
    if (room.players.size >= room.maxPlayers) {
      return { success: false, error: '방이 가득 찼습니다.' };
    }

    // 참가
    room.players.set(socketId, { userId, characterId, socketId });
    return { success: true };
  }

  // 방 퇴장
  leaveRoom(socketId: string, sessionId: string): boolean {
    const room = this.rooms.get(sessionId);
    if (!room) return false;

    const deleted = room.players.delete(socketId);

    // 방이 비면 정리
    if (room.players.size === 0) {
      this.rooms.delete(sessionId);
    }

    return deleted;
  }

  // 소켓이 속한 모든 방에서 퇴장 (연결 종료 시)
  leaveAllRooms(socketId: string): { sessionId: string; userId: string }[] {
    const leftRooms: { sessionId: string; userId: string }[] = [];

    for (const [sessionId, room] of this.rooms.entries()) {
      const player = room.players.get(socketId);
      if (player) {
        room.players.delete(socketId);
        leftRooms.push({ sessionId, userId: player.userId });

        // 방이 비면 정리
        if (room.players.size === 0) {
          this.rooms.delete(sessionId);
        }
      }
    }

    return leftRooms;
  }

  // 방 정보 조회
  getRoomInfo(sessionId: string): RoomInfo | null {
    return this.rooms.get(sessionId) ?? null;
  }

  // 방 인원 수 조회
  getPlayerCount(sessionId: string): number {
    const room = this.rooms.get(sessionId);
    return room ? room.players.size : 0;
  }

  // 플레이어가 방에 있는지 확인
  isPlayerInRoom(userId: string, sessionId: string): boolean {
    const room = this.rooms.get(sessionId);
    if (!room) return false;

    return Array.from(room.players.values()).some((p) => p.userId === userId);
  }

  // 소켓ID로 플레이어 정보 조회
  getPlayerBySocketId(socketId: string, sessionId: string): RoomPlayer | null {
    const room = this.rooms.get(sessionId);
    if (!room) return null;
    return room.players.get(socketId) ?? null;
  }

  // 최대 인원 설정
  setMaxPlayers(sessionId: string, maxPlayers: number): void {
    const room = this.rooms.get(sessionId);
    if (room) {
      room.maxPlayers = maxPlayers;
    }
  }
}
