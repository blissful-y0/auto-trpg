// 메시지 REST API — 세션별 메시지 조회/저장

import { Router, Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../lib/supabase';
import { AppError } from '../middleware/errorHandler';

const router = Router({ mergeParams: true });

// GET /api/sessions/:sessionId/messages — 메시지 조회 (페이지네이션)
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { sessionId } = req.params;

    let limit = 50;
    if (req.query.limit) {
      const parsed = parseInt(req.query.limit as string, 10);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
        throw new AppError(400, 'limit must be an integer between 1 and 100');
      }
      limit = parsed;
    }

    const before = req.query.before as string;

    let query = supabaseAdmin
      .from('messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (before) {
      query = query.lt('created_at', before);
    }

    const { data, error } = await query;

    if (error) {
      throw new AppError(500, `메시지 조회 실패: ${error.message}`);
    }

    res.json({ data: data || [] });
  } catch (err) {
    next(err);
  }
});

// POST /api/sessions/:sessionId/messages — 메시지 저장
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user!.id;
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
