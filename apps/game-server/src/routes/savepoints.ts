// 세이브포인트 라우트 — 세이브/로드/일시정지/재개

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabase';
import { AppError } from '../middleware/errorHandler';
import { assertSessionParticipant } from '../lib/authorization';
import { SaveManager } from '../services/redis/SaveManager';
import { PersistenceManager } from '../services/redis/PersistenceManager';

// 외부에서 주입받는 서비스 인스턴스
let saveManager: SaveManager;
let persistenceManager: PersistenceManager;

export function initSavepointRoutes(sm: SaveManager, pm: PersistenceManager): void {
  saveManager = sm;
  persistenceManager = pm;
}

const router = Router();

// 라우트 파라미터 타입
type SessionParams = { id: string };
type SavePointParams = { id: string; savePointId: string };

// 수동 세이브 요청 스키마
const saveSchema = z.object({
  name: z.string().max(100).optional(),
});

// ─── POST /api/sessions/:id/save — 수동 세이브 ─────────

router.post('/:id/save', async (req: Request<SessionParams>, res: Response, next: NextFunction) => {
  try {
    const { id: sessionId } = req.params;
    const userId = req.user!.id;

    // 참가자 확인
    await assertSessionParticipant(sessionId, userId);

    const parsed = saveSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, `요청 데이터가 올바르지 않습니다: ${parsed.error.message}`);
    }

    const result = await saveManager.save(sessionId, userId, parsed.data.name);

    res.status(201).json({ data: result });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/sessions/:id/saves — 세이브포인트 목록 ────

router.get('/:id/saves', async (req: Request<SessionParams>, res: Response, next: NextFunction) => {
  try {
    const { id: sessionId } = req.params;
    const userId = req.user!.id;

    await assertSessionParticipant(sessionId, userId);

    const savePoints = await saveManager.listSavePoints(sessionId);

    res.json({ data: savePoints });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/sessions/:id/load/:savePointId — 로드 ────

router.post(
  '/:id/load/:savePointId',
  async (req: Request<SavePointParams>, res: Response, next: NextFunction) => {
    try {
      const { id: sessionId, savePointId } = req.params;
      const userId = req.user!.id;

      await assertSessionParticipant(sessionId, userId);

      const snapshot = await saveManager.load(sessionId, savePointId);

      res.json({ data: { restored: true, snapshot } });
    } catch (err) {
      next(err);
    }
  },
);

// ─── DELETE /api/sessions/:id/saves/:savePointId ────────

router.delete(
  '/:id/saves/:savePointId',
  async (req: Request<SavePointParams>, res: Response, next: NextFunction) => {
    try {
      const { id: sessionId, savePointId } = req.params;
      const userId = req.user!.id;

      // 세션 생성자만 삭제 가능
      const { data: session } = await supabaseAdmin
        .from('game_sessions')
        .select('created_by')
        .eq('id', sessionId)
        .single();

      if (!session) {
        throw new AppError(404, '세션을 찾을 수 없습니다.');
      }

      if (session.created_by !== userId) {
        throw new AppError(403, '세션 생성자만 세이브포인트를 삭제할 수 있습니다.');
      }

      await saveManager.deleteSavePoint(savePointId, sessionId);

      res.json({ message: '세이브포인트가 삭제되었습니다.' });
    } catch (err) {
      next(err);
    }
  },
);

// ─── PUT /api/sessions/:id/pause — 일시정지 ────────────

router.put('/:id/pause', async (req: Request<SessionParams>, res: Response, next: NextFunction) => {
  try {
    const { id: sessionId } = req.params;
    const userId = req.user!.id;

    // 세션 생성자(GM)만 일시정지 가능
    const { data: session } = await supabaseAdmin
      .from('game_sessions')
      .select('created_by, status')
      .eq('id', sessionId)
      .single();

    if (!session) {
      throw new AppError(404, '세션을 찾을 수 없습니다.');
    }

    if (session.created_by !== userId) {
      throw new AppError(403, '세션 생성자만 일시정지할 수 있습니다.');
    }

    if (session.status !== 'active') {
      throw new AppError(400, '활성 상태인 세션만 일시정지할 수 있습니다.');
    }

    // 일시정지 세이브포인트 생성
    const saveResult = await saveManager.savePause(sessionId, userId);

    // 세션 상태 변경
    await supabaseAdmin
      .from('game_sessions')
      .update({ status: 'paused', updated_at: new Date().toISOString() })
      .eq('id', sessionId);

    // Redis 상태 flush (데이터 보존)
    await persistenceManager.flushSession(sessionId);

    // 게임 이벤트 기록
    await supabaseAdmin.from('game_events').insert({
      session_id: sessionId,
      event_type: 'session_pause',
      actor_id: userId,
      data: { savePointId: saveResult.id },
    });

    res.json({
      data: {
        savePointId: saveResult.id,
        status: 'paused',
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── PUT /api/sessions/:id/resume — 재개 ───────────────

router.put('/:id/resume', async (req: Request<SessionParams>, res: Response, next: NextFunction) => {
  try {
    const { id: sessionId } = req.params;
    const userId = req.user!.id;

    // 세션 생성자(GM)만 재개 가능
    const { data: session } = await supabaseAdmin
      .from('game_sessions')
      .select('created_by, status')
      .eq('id', sessionId)
      .single();

    if (!session) {
      throw new AppError(404, '세션을 찾을 수 없습니다.');
    }

    if (session.created_by !== userId) {
      throw new AppError(403, '세션 생성자만 재개할 수 있습니다.');
    }

    if (session.status !== 'paused') {
      throw new AppError(400, '일시정지 상태인 세션만 재개할 수 있습니다.');
    }

    // 세션 상태 변경
    await supabaseAdmin
      .from('game_sessions')
      .update({ status: 'active', updated_at: new Date().toISOString() })
      .eq('id', sessionId);

    // Supabase → Redis 재로드
    await persistenceManager.loadSession(sessionId);

    // 게임 이벤트 기록
    await supabaseAdmin.from('game_events').insert({
      session_id: sessionId,
      event_type: 'session_resume',
      actor_id: userId,
      data: {},
    });

    res.json({
      data: { status: 'active' },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
