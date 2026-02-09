import { describe, it, expect, beforeEach } from 'vitest';
import { RoomManager } from '../RoomManager';

describe('RoomManager', () => {
  let roomManager: RoomManager;

  beforeEach(() => {
    roomManager = new RoomManager();
  });

  describe('joinRoom', () => {
    it('첫 번째 플레이어 참가 시 방이 생성되고 성공해야 한다', () => {
      const result = roomManager.joinRoom('socket-1', 'session-1', 'user-1', 'char-1');

      expect(result.success).toBe(true);
      expect(roomManager.getPlayerCount('session-1')).toBe(1);
    });

    it('여러 플레이어가 같은 방에 참가할 수 있어야 한다', () => {
      roomManager.joinRoom('socket-1', 'session-1', 'user-1');
      roomManager.joinRoom('socket-2', 'session-1', 'user-2');

      expect(roomManager.getPlayerCount('session-1')).toBe(2);
    });

    it('최대 인원 초과 시 참가에 실패해야 한다', () => {
      roomManager.joinRoom('socket-1', 'session-1', 'user-1');
      roomManager.setMaxPlayers('session-1', 2);
      roomManager.joinRoom('socket-2', 'session-1', 'user-2');

      const result = roomManager.joinRoom('socket-3', 'session-1', 'user-3');

      expect(result.success).toBe(false);
      expect(result.error).toBe('방이 가득 찼습니다.');
      expect(roomManager.getPlayerCount('session-1')).toBe(2);
    });

    it('같은 유저가 재연결하면 소켓ID만 갱신되어야 한다', () => {
      roomManager.joinRoom('socket-1', 'session-1', 'user-1', 'char-1');

      // 같은 유저가 새 소켓으로 재연결
      const result = roomManager.joinRoom('socket-2', 'session-1', 'user-1', 'char-1');

      expect(result.success).toBe(true);
      expect(roomManager.getPlayerCount('session-1')).toBe(1);

      // 이전 소켓ID로는 조회 불가
      expect(roomManager.getPlayerBySocketId('socket-1', 'session-1')).toBeNull();
      // 새 소켓ID로 조회 가능
      expect(roomManager.getPlayerBySocketId('socket-2', 'session-1')).not.toBeNull();
    });
  });

  describe('leaveRoom', () => {
    it('퇴장 후 인원이 감소해야 한다', () => {
      roomManager.joinRoom('socket-1', 'session-1', 'user-1');
      roomManager.joinRoom('socket-2', 'session-1', 'user-2');

      roomManager.leaveRoom('socket-1', 'session-1');

      expect(roomManager.getPlayerCount('session-1')).toBe(1);
    });

    it('마지막 플레이어 퇴장 시 방이 삭제되어야 한다', () => {
      roomManager.joinRoom('socket-1', 'session-1', 'user-1');
      roomManager.leaveRoom('socket-1', 'session-1');

      expect(roomManager.getRoomInfo('session-1')).toBeNull();
      expect(roomManager.getPlayerCount('session-1')).toBe(0);
    });

    it('존재하지 않는 방에서 퇴장 시 false를 반환해야 한다', () => {
      const result = roomManager.leaveRoom('socket-1', 'nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('leaveAllRooms', () => {
    it('소켓이 속한 모든 방에서 퇴장해야 한다', () => {
      roomManager.joinRoom('socket-1', 'session-1', 'user-1');
      roomManager.joinRoom('socket-1', 'session-2', 'user-1');

      const leftRooms = roomManager.leaveAllRooms('socket-1');

      expect(leftRooms).toHaveLength(2);
      expect(roomManager.getPlayerCount('session-1')).toBe(0);
      expect(roomManager.getPlayerCount('session-2')).toBe(0);
    });
  });

  describe('isPlayerInRoom', () => {
    it('참가한 플레이어는 true를 반환해야 한다', () => {
      roomManager.joinRoom('socket-1', 'session-1', 'user-1');

      expect(roomManager.isPlayerInRoom('user-1', 'session-1')).toBe(true);
    });

    it('참가하지 않은 플레이어는 false를 반환해야 한다', () => {
      expect(roomManager.isPlayerInRoom('user-1', 'session-1')).toBe(false);
    });
  });

  describe('getRoomInfo', () => {
    it('존재하는 방의 정보를 반환해야 한다', () => {
      roomManager.joinRoom('socket-1', 'session-1', 'user-1');

      const info = roomManager.getRoomInfo('session-1');

      expect(info).not.toBeNull();
      expect(info!.sessionId).toBe('session-1');
      expect(info!.players.size).toBe(1);
    });

    it('존재하지 않는 방은 null을 반환해야 한다', () => {
      expect(roomManager.getRoomInfo('nonexistent')).toBeNull();
    });
  });
});
