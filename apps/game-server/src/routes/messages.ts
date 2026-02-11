// 메시지 REST API — 세션별 메시지 조회/저장

import { Router, Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../lib/supabase';
import { AppError } from '../middleware/errorHandler';
import { assertSessionParticipant } from '../lib/authorization';

const router = Router({ mergeParams: true });

// GET /api/sessions/:sessionId/messages — 메시지 조회 (페이지네이션)
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user!.id;

    // 참가자 확인 (IDOR 방지: 참가자만 메시지 조회 가능)
    await assertSessionParticipant(sessionId as string, userId);

    let limit = 200;
    if (req.query.limit) {
      const parsed = parseInt(req.query.limit as string, 10);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 500) {
        throw new AppError(400, 'limit must be an integer between 1 and 500');
      }
      limit = parsed;
    }
    const before = req.query.before as string;

    // 최신 N개를 가져온 뒤 시간순으로 정렬하여 반환
    let query = supabaseAdmin
      .from('messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (before) {
      query = query.lt('created_at', before);
    }

    const { data, error } = await query;

    if (error) {
      throw new AppError(500, `메시지 조회 실패: ${error.message}`);
    }

    // 최신→오래된 순으로 가져왔으므로, 오래된→최신 순으로 뒤집어 반환
    const sorted = (data || []).reverse();
    res.json({ data: sorted });
  } catch (err) {
    next(err);
  }
});

// POST /api/sessions/:sessionId/messages — 메시지 저장
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user!.id;

    // 참가자 확인 (IDOR 방지: 참가자만 메시지 작성 가능)
    await assertSessionParticipant(sessionId as string, userId);

    const { content, type } = req.body;

    if (!content || typeof content !== 'string') {
      throw new AppError(400, '메시지 내용이 필요합니다.');
    }

    const senderType = type === 'ooc' ? 'player' : type || 'player';
    const isOOC = type === 'ooc';

    const { data, error } = await supabaseAdmin
      .from('messages')
      .insert({
        session_id: sessionId,
        sender_id: userId,
        sender_type: senderType,
        content,
        is_ooc: isOOC,
      })
      .select()
      .single();

    if (error) {
      throw new AppError(500, `메시지 저장 실패: ${error.message}`);
    }

    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
});

export default router;
