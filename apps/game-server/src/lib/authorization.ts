/**
 * Shared authorization helpers for session-scoped and object-scoped access control.
 * Reusable across route handlers to prevent IDOR vulnerabilities.
 */

import { supabaseAdmin } from './supabase';
import { AppError } from '../middleware/errorHandler';

/**
 * Asserts that the given user is a participant of the given session.
 * Returns the participant row (with role) on success.
 * Throws 404 if session doesn't exist, 403 if user is not a participant.
 */
export async function assertSessionParticipant(
  sessionId: string,
  userId: string,
): Promise<{ id: string; role: string; character_id: string | null }> {
  // Verify session exists
  // 소프트 삭제된 세션 제외
  const { data: session } = await supabaseAdmin
    .from('game_sessions')
    .select('id')
    .eq('id', sessionId)
    .is('deleted_at', null)
    .single();

  if (!session) {
    throw new AppError(404, '세션을 찾을 수 없습니다.');
  }

  // Verify user is a participant
  // 소프트 삭제된 참가자 제외
  const { data: participant } = await supabaseAdmin
    .from('session_participants')
    .select('id, role, character_id')
    .eq('session_id', sessionId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .single();

  if (!participant) {
    throw new AppError(403, '해당 세션에 참가하지 않았습니다.');
  }

  return participant;
}

/**
 * Asserts that the given user owns the specified rulebook.
 * Returns the rulebook row on success.
 * Throws 404 if not found, 403 if not the owner.
 */
export async function assertRulebookOwner(
  rulebookId: string,
  userId: string,
): Promise<{ id: string; user_id: string }> {
  // 소프트 삭제된 규칙서 제외
  const { data: rulebook } = await supabaseAdmin
    .from('rulebooks')
    .select('id, user_id')
    .eq('id', rulebookId)
    .is('deleted_at', null)
    .single();

  if (!rulebook) {
    throw new AppError(404, '규칙서를 찾을 수 없습니다.');
  }

  if (rulebook.user_id !== userId) {
    throw new AppError(403, '해당 규칙서에 대한 접근 권한이 없습니다.');
  }

  return rulebook;
}

/**
 * Checks whether a user can access a rulebook — either as the owner,
 * or as a participant of a session that has this rulebook linked.
 * Throws 404 if not found, 403 if no access path exists.
 */
export async function assertRulebookAccess(rulebookId: string, userId: string): Promise<void> {
  // 소프트 삭제된 규칙서 제외
  const { data: rulebook } = await supabaseAdmin
    .from('rulebooks')
    .select('id, user_id')
    .eq('id', rulebookId)
    .is('deleted_at', null)
    .single();

  if (!rulebook) {
    throw new AppError(404, '규칙서를 찾을 수 없습니다.');
  }

  // Owner always has access
  if (rulebook.user_id === userId) {
    return;
  }

  // Check if user is a participant in any session that links this rulebook
  const { data: linkedSessions } = await supabaseAdmin
    .from('session_rulebooks')
    .select('session_id')
    .eq('rulebook_id', rulebookId);

  if (linkedSessions && linkedSessions.length > 0) {
    const sessionIds = linkedSessions.map((s: { session_id: string }) => s.session_id);

    // 소프트 삭제된 참가자 제외
    const { data: participation } = await supabaseAdmin
      .from('session_participants')
      .select('id')
      .eq('user_id', userId)
      .in('session_id', sessionIds)
      .is('deleted_at', null)
      .limit(1)
      .single();

    if (participation) {
      return;
    }
  }

  throw new AppError(403, '해당 규칙서에 대한 접근 권한이 없습니다.');
}
