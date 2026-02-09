import { Router, Request, Response } from 'express';
import { supabaseAdmin } from '../lib/supabase';

const router = Router();

// GET /api/health — 서버 상태 확인
router.get('/', async (_req: Request, res: Response) => {
  const startTime = process.uptime();

  // Supabase 연결 상태 확인
  let supabaseStatus = 'disconnected';
  try {
    const { error } = await supabaseAdmin.from('profiles').select('id').limit(1);
    supabaseStatus = error ? 'error' : 'connected';
  } catch {
    supabaseStatus = 'error';
  }

  // Redis 연결 상태 (Phase 2에서 구현)
  const redisStatus = 'not_configured';

  res.json({
    status: 'ok',
    uptime: startTime,
    version: '0.1.0',
    timestamp: new Date().toISOString(),
    services: {
      supabase: supabaseStatus,
      redis: redisStatus,
    },
  });
});

export default router;
