import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabase';
import { AppError } from '../middleware/errorHandler';
import { assertSessionParticipant } from '../lib/authorization';

const router = Router();

// 세션 생성 요청 스키마
const createSessionSchema = z.object({
  name: z.string().min(1).max(100),
  gameSystem: z.string().min(1).max(50),
  maxPlayers: z.number().int().min(1).max(8).default(4),
  primaryProvider: z.enum(['claude', 'openai', 'gemini']),
  primaryModel: z.string().min(1).max(200).optional(),
  gmAggressiveness: z.enum(['passive', 'moderate', 'aggressive']).default('moderate'),
  rulebookIds: z.array(z.string().uuid()).optional(),
});

// POST /api/sessions — 세션 생성
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = createSessionSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, `요청 데이터가 올바르지 않습니다: ${parsed.error.message}`);
    }

    const {
      name,
      gameSystem,
      maxPlayers,
      primaryProvider,
      primaryModel,
      gmAggressiveness,
      rulebookIds,
    } = parsed.data;
    const userId = req.user!.id;

    // 세션 생성
    const { data: session, error: sessionError } = await supabaseAdmin
      .from('game_sessions')
      .insert({
        name,
        game_system: gameSystem,
        max_players: maxPlayers,
        primary_provider: primaryProvider,
        gm_aggressiveness: gmAggressiveness,
        settings: {
          llm: {
            provider: primaryProvider,
            ...(primaryModel ? { model: primaryModel } : {}),
          },
        },
        created_by: userId,
        status: 'waiting',
      })
      .select()
      .single();

    if (sessionError || !session) {
      throw new AppError(500, `세션 생성 실패: ${sessionError?.message}`);
    }

    // 생성자를 참가자로 추가
    await supabaseAdmin.from('session_participants').insert({
      session_id: session.id,
      user_id: userId,
      role: 'gm',
    });

    // 규칙서 연결
    if (rulebookIds && rulebookIds.length > 0) {
      const rulebookLinks = rulebookIds.map((rulebookId) => ({
        session_id: session.id,
        rulebook_id: rulebookId,
      }));
      await supabaseAdmin.from('session_rulebooks').insert(rulebookLinks);
    }

    res.status(201).json({ data: session });
  } catch (err) {
    next(err);
  }
});

// GET /api/sessions — 내 세션 목록
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;

    // 참가 중인 세션 ID 조회
    const { data: participations } = await supabaseAdmin
      .from('session_participants')
      .select('session_id')
      .eq('user_id', userId);

    const sessionIds = participations?.map((p: { session_id: string }) => p.session_id) || [];

    // 생성했거나 참가 중인 세션 조회
    const { data: sessions, error } = await supabaseAdmin
      .from('game_sessions')
      .select('*')
      .or(`created_by.eq.${userId},id.in.(${sessionIds.join(',')})`)
      .order('created_at', { ascending: false });

    if (error) {
      throw new AppError(500, `세션 목록 조회 실패: ${error.message}`);
    }

    res.json({ data: sessions || [] });
  } catch (err) {
    next(err);
  }
});

// GET /api/sessions/:id — 세션 상세
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    // 참가자 확인 (IDOR 방지: 참가자만 세션 상세 조회 가능)
    await assertSessionParticipant(id as string, userId);

    // 세션 기본 정보
    const { data: session, error: sessionError } = await supabaseAdmin
      .from('game_sessions')
      .select('*')
      .eq('id', id)
      .single();

    if (sessionError || !session) {
      throw new AppError(404, '세션을 찾을 수 없습니다.');
    }

    // 참가자 목록
    const { data: participants } = await supabaseAdmin
      .from('session_participants')
      .select('*, profiles(id, display_name, avatar_url)')
      .eq('session_id', id);

    // 캐릭터 목록
    const { data: characters } = await supabaseAdmin
      .from('characters')
      .select('*')
      .eq('session_id', id);

    // 연결된 규칙서
    const { data: rulebooks } = await supabaseAdmin
      .from('session_rulebooks')
      .select('*, rulebooks(*)')
      .eq('session_id', id);

    res.json({
      data: {
        ...session,
        participants: participants || [],
        characters: characters || [],
        rulebooks: rulebooks?.map((r: { rulebooks: unknown }) => r.rulebooks) || [],
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/sessions/:id/join — 세션 참가
router.post('/:id/join', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    // 세션 확인
    const { data: session, error: sessionError } = await supabaseAdmin
      .from('game_sessions')
      .select('id, max_players, status')
      .eq('id', id)
      .single();

    if (sessionError || !session) {
      throw new AppError(404, '세션을 찾을 수 없습니다.');
    }

    if (session.status !== 'waiting') {
      throw new AppError(400, '대기 중인 세션에만 참가할 수 있습니다.');
    }

    // 현재 참가자 수 확인
    const { count } = await supabaseAdmin
      .from('session_participants')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', id);

    if (count !== null && count >= session.max_players) {
      throw new AppError(400, '세션이 가득 찼습니다.');
    }

    // 이미 참가했는지 확인
    const { data: existing } = await supabaseAdmin
      .from('session_participants')
      .select('id')
      .eq('session_id', id)
      .eq('user_id', userId)
      .single();

    if (existing) {
      throw new AppError(409, '이미 참가한 세션입니다.');
    }

    // 참가자 추가
    const { data: participant, error: joinError } = await supabaseAdmin
      .from('session_participants')
      .insert({
        session_id: id,
        user_id: userId,
        role: 'player',
      })
      .select()
      .single();

    if (joinError) {
      throw new AppError(500, `세션 참가 실패: ${joinError.message}`);
    }

    res.status(201).json({ data: participant });
  } catch (err) {
    next(err);
  }
});

// POST /api/sessions/:id/leave — 세션 퇴장
router.post('/:id/leave', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    // 세션 생성자는 퇴장 불가
    const { data: session } = await supabaseAdmin
      .from('game_sessions')
      .select('created_by')
      .eq('id', id)
      .single();

    if (session?.created_by === userId) {
      throw new AppError(400, '세션 생성자는 퇴장할 수 없습니다. 세션을 삭제해주세요.');
    }

    const { error } = await supabaseAdmin
      .from('session_participants')
      .delete()
      .eq('session_id', id)
      .eq('user_id', userId);

    if (error) {
      throw new AppError(500, `세션 퇴장 실패: ${error.message}`);
    }

    res.json({ message: '세션에서 퇴장했습니다.' });
  } catch (err) {
    next(err);
  }
});

// 세션 업데이트 스키마
const updateSessionSchema = z.object({
  status: z.enum(['waiting', 'active', 'paused', 'completed']).optional(),
  world_state: z.record(z.unknown()).optional(),
  name: z.string().min(1).max(100).optional(),
  primaryProvider: z.enum(['claude', 'openai', 'gemini']).optional(),
  primaryModel: z.string().min(1).max(200).optional(),
});

// PATCH /api/sessions/:id — 세션 상태 변경 (생성자만)
router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    // 생성자 확인
    const { data: session } = await supabaseAdmin
      .from('game_sessions')
      .select('created_by, primary_provider, settings')
      .eq('id', id)
      .single();

    if (!session) {
      throw new AppError(404, '세션을 찾을 수 없습니다.');
    }

    if (session.created_by !== userId) {
      throw new AppError(403, '세션 생성자만 수정할 수 있습니다.');
    }

    const parsed = updateSessionSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, `요청 데이터가 올바르지 않습니다: ${parsed.error.message}`);
    }

    const payload: Record<string, unknown> = {};

    if (parsed.data.status) {
      payload.status = parsed.data.status;
    }
    if (parsed.data.world_state) {
      payload.world_state = parsed.data.world_state;
    }
    if (parsed.data.name) {
      payload.name = parsed.data.name;
    }
    if (parsed.data.primaryProvider) {
      payload.primary_provider = parsed.data.primaryProvider;
    }

    if (parsed.data.primaryProvider || parsed.data.primaryModel) {
      const baseSettings =
        session.settings && typeof session.settings === 'object' && !Array.isArray(session.settings)
          ? (session.settings as Record<string, unknown>)
          : {};

      const existingLlm =
        baseSettings.llm && typeof baseSettings.llm === 'object' && !Array.isArray(baseSettings.llm)
          ? (baseSettings.llm as Record<string, unknown>)
          : {};

      const nextProvider =
        parsed.data.primaryProvider ?? session.primary_provider ?? existingLlm.provider;
      const nextModel = parsed.data.primaryModel ?? existingLlm.model;

      payload.settings = {
        ...baseSettings,
        llm: {
          ...existingLlm,
          ...(nextProvider ? { provider: nextProvider } : {}),
          ...(nextModel ? { model: nextModel } : {}),
        },
      };
    }

    const { data: updated, error } = await supabaseAdmin
      .from('game_sessions')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new AppError(500, `세션 수정 실패: ${error.message}`);
    }

    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
});

export default router;
