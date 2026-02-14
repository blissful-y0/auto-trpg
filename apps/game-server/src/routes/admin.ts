// 관리자 라우트 — soft delete 레코드 영구 삭제, 조회, 복원

import { Router, Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../lib/supabase';
import { AppError } from '../middleware/errorHandler';

const router = Router();

// 소프트 삭제 대상 테이블 목록 (의존 순서: 자식 → 부모)
const SOFT_DELETE_TABLES = [
  'save_points',
  'session_participants',
  'characters',
  'user_api_keys',
  'game_sessions',
  'campaigns',
  'rulebooks',
] as const;

type SoftDeleteTable = (typeof SOFT_DELETE_TABLES)[number];

// 테이블별 소유자 컬럼 매핑
const OWNER_COLUMN: Partial<Record<SoftDeleteTable, string>> = {
  rulebooks: 'user_id',
  campaigns: 'created_by',
  user_api_keys: 'user_id',
  game_sessions: 'created_by',
};

// POST /api/admin/purge — 소프트 삭제된 레코드 영구 삭제
// Query: ?olderThanDays=30 (기본값 30일)
router.post('/purge', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const olderThanDays = Math.max(1, Number(req.query.olderThanDays) || 30);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - olderThanDays);
    const cutoffISO = cutoff.toISOString();

    const results: Record<string, number> = {};

    for (const table of SOFT_DELETE_TABLES) {
      // 삭제 대상 카운트
      let countQuery = supabaseAdmin
        .from(table)
        .select('id', { count: 'exact', head: true })
        .not('deleted_at', 'is', null)
        .lt('deleted_at', cutoffISO);

      const ownerCol = OWNER_COLUMN[table];
      if (ownerCol) {
        countQuery = countQuery.eq(ownerCol, userId);
      }

      const { count } = await countQuery;
      results[table] = count ?? 0;

      if ((count ?? 0) > 0) {
        // 영구 삭제 수행
        let deleteQuery = supabaseAdmin
          .from(table)
          .delete()
          .not('deleted_at', 'is', null)
          .lt('deleted_at', cutoffISO);

        if (ownerCol) {
          deleteQuery = deleteQuery.eq(ownerCol, userId);
        }

        await deleteQuery;
      }
    }

    res.json({
      message: `${olderThanDays}일 이전에 삭제된 레코드를 영구 삭제했습니다.`,
      data: results,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/deleted — 소프트 삭제된 레코드 현황 조회
router.get('/deleted', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const counts: Record<string, number> = {};

    for (const table of SOFT_DELETE_TABLES) {
      const { count } = await supabaseAdmin
        .from(table)
        .select('id', { count: 'exact', head: true })
        .not('deleted_at', 'is', null);

      counts[table] = count ?? 0;
    }

    res.json({ data: counts });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/restore/:table/:id — 소프트 삭제된 레코드 복원
router.post('/restore/:table/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { table, id } = req.params;

    if (!SOFT_DELETE_TABLES.includes(table as SoftDeleteTable)) {
      throw new AppError(400, `지원하지 않는 테이블: ${table}`);
    }

    const { data, error } = await supabaseAdmin
      .from(table as SoftDeleteTable)
      .update({ deleted_at: null })
      .eq('id', id)
      .not('deleted_at', 'is', null)
      .select()
      .single();

    if (error || !data) {
      throw new AppError(404, '복원할 레코드를 찾을 수 없습니다.');
    }

    res.json({ message: '레코드가 복원되었습니다.', data });
  } catch (err) {
    next(err);
  }
});

export default router;
