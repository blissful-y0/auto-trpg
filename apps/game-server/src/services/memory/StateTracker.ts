// 상태 추적기 — 게임 스냅샷 및 상태 변경 이력 관리

import type { SnapshotInput, StateChangeInfo } from './types';

export class StateTracker {
  // 세션별 스냅샷 저장소
  private snapshots: Map<string, SnapshotInput[]> = new Map();

  // 세션별 상태 변경 이력
  private changeHistory: Map<string, StateChangeInfo[]> = new Map();

  // 스냅샷 생성 및 저장
  createSnapshot(input: SnapshotInput): SnapshotInput {
    if (!this.snapshots.has(input.sessionId)) {
      this.snapshots.set(input.sessionId, []);
    }
    this.snapshots.get(input.sessionId)!.push(input);
    return input;
  }

  // 최신 스냅샷 가져오기
  getLatestSnapshot(sessionId: string): SnapshotInput | null {
    const snaps = this.snapshots.get(sessionId);
    if (!snaps || snaps.length === 0) return null;
    return snaps[snaps.length - 1];
  }

  // 상태 변경 이력 추가
  trackStateChange(sessionId: string, change: StateChangeInfo): void {
    if (!this.changeHistory.has(sessionId)) {
      this.changeHistory.set(sessionId, []);
    }
    this.changeHistory.get(sessionId)!.push(change);
  }

  // 상태 변경 이력 조회
  getChangeHistory(sessionId: string): StateChangeInfo[] {
    return this.changeHistory.get(sessionId) || [];
  }
}
