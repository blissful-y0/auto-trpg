// 캠페인 라우트 — 멀티 세션 캠페인 CRUD

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabase';
import { AppError } from '../middleware/errorHandler';

const router = Router();

// ─── 스키마 정의 ────────────────────────────────────────

const createCampaignSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(2000).default(''),
  gameSystem: z.string().min(1).max(50).default('dnd5e'),
});

const updateCampaignSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(2000).optional(),
  status: z.enum(['active', 'completed', 'archived']).optional(),
  worldState: z.record(z.unknown()).optional(),
});

const createCampaignSessionSchema = z.object({
  name: z.string().min(1).max(100),
  maxPlayers: z.number().int().min(1).max(6).default(4),
  primaryProvider: z.enum(['claude', 'openai', 'gemini']).default('claude'),
});

// ─── POST /api/campaigns — 캠페인 생성 ──────────────────

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const parsed = createCampaignSchema.safeParse(req.body);

    if (!parsed.success) {
      throw new AppError(400, `요청 데이터가 올바르지 않습니다: ${parsed.error.message}`);
    }

    const { name, description, gameSystem } = parsed.data;

    const { data: campaign, error } = await supabaseAdmin
      .from('campaigns')
      .insert({
        name,
        description,
        game_system: gameSystem,
        created_by: userId,
      })
      .select()
      .single();

    if (error || !campaign) {
      throw new AppError(500, `캠페인 생성 실패: ${error?.message}`);
    }

    res.status(201).json({ data: campaign });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/campaigns — 내 캠페인 목록 ────────────────

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;

    const { data: campaigns, error } = await supabaseAdmin
      .from('campaigns')
      .select('*')
      .eq('created_by', userId)
      .order('updated_at', { ascending: false });

    if (error) {
      throw new AppError(500, `캠페인 목록 조회 실패: ${error.message}`);
    }

    res.json({ data: campaigns || [] });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/campaigns/:id — 캠페인 상세 (세션 포함) ───

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    // 캠페인 조회
    const { data: campaign, error: campaignError } = await supabaseAdmin
      .from('campaigns')
      .select('*')
      .eq('id', id)
      .single();

    if (campaignError || !campaign) {
      throw new AppError(404, '캠페인을 찾을 수 없습니다.');
    }

    if (campaign.created_by !== userId) {
      throw new AppError(403, '캠페인에 대한 접근 권한이 없습니다.');
    }

    // 캠페인에 연결된 세션 목록
    const { data: sessions } = await supabaseAdmin
      .from('game_sessions')
      .select('id, name, status, session_order, created_at, updated_at')
      .eq('campaign_id', id)
      .order('session_order', { ascending: true });

    res.json({
      data: {
        ...campaign,
        sessions: (sessions || []).map((s: Record<string, unknown>) => ({
          id: s.id,
          name: s.name,
          status: s.status,
          sessionOrder: s.session_order,
          createdAt: s.created_at,
          updatedAt: s.updated_at,
        })),
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /api/campaigns/:id — 캠페인 수정 ────────────

router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    // 생성자 확인
    const { data: campaign } = await supabaseAdmin
      .from('campaigns')
      .select('created_by')
      .eq('id', id)
      .single();

    if (!campaign) {
      throw new AppError(404, '캠페인을 찾을 수 없습니다.');
    }

    if (campaign.created_by !== userId) {
      throw new AppError(403, '캠페인 생성자만 수정할 수 있습니다.');
    }

    const parsed = updateCampaignSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, `요청 데이터가 올바르지 않습니다: ${parsed.error.message}`);
    }

    const payload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (parsed.data.name !== undefined) payload.name = parsed.data.name;
    if (parsed.data.description !== undefined) payload.description = parsed.data.description;
    if (parsed.data.status !== undefined) payload.status = parsed.data.status;
    if (parsed.data.worldState !== undefined) payload.world_state = parsed.data.worldState;

    const { data: updated, error } = await supabaseAdmin
      .from('campaigns')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new AppError(500, `캠페인 수정 실패: ${error.message}`);
    }

    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/campaigns/:id/sessions — 캠페인 세션 생성

router.post('/:id/sessions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id: campaignId } = req.params;
    const userId = req.user!.id;

    // 캠페인 조회 및 소유자 확인
    const { data: campaign } = await supabaseAdmin
      .from('campaigns')
      .select('*')
      .eq('id', campaignId)
      .single();

    if (!campaign) {
      throw new AppError(404, '캠페인을 찾을 수 없습니다.');
    }

    if (campaign.created_by !== userId) {
      throw new AppError(403, '캠페인 생성자만 세션을 추가할 수 있습니다.');
    }

    const parsed = createCampaignSessionSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, `요청 데이터가 올바르지 않습니다: ${parsed.error.message}`);
    }

    // 이전 세션의 최대 순서 조회
    const { data: lastSession } = await supabaseAdmin
      .from('game_sessions')
      .select('session_order, world_state')
      .eq('campaign_id', campaignId)
      .order('session_order', { ascending: false })
      .limit(1)
      .single();

    const nextOrder = (lastSession?.session_order ?? 0) + 1;
    // 이전 세션의 worldState 또는 캠페인의 worldState 이어받기
    const inheritedWorldState = lastSession?.world_state ?? campaign.world_state ?? {};

    const { name, maxPlayers, primaryProvider } = parsed.data;

    // 새 세션 생성
    const { data: session, error: sessionError } = await supabaseAdmin
      .from('game_sessions')
      .insert({
        name,
        game_system: campaign.game_system,
        max_players: maxPlayers,
        primary_provider: primaryProvider,
        created_by: userId,
        status: 'waiting',
        campaign_id: campaignId,
        session_order: nextOrder,
        world_state: inheritedWorldState,
        settings: campaign.settings ?? {},
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

    // 이전 세션의 캐릭터 복제 (active 상태만)
    if (lastSession) {
      const { data: prevSessionData } = await supabaseAdmin
        .from('game_sessions')
        .select('id')
        .eq('campaign_id', campaignId)
        .eq('session_order', nextOrder - 1)
        .single();

      if (prevSessionData) {
        const { data: prevCharacters } = await supabaseAdmin
          .from('characters')
          .select('*')
          .eq('session_id', prevSessionData.id)
          .eq('status', 'active');

        if (prevCharacters && prevCharacters.length > 0) {
          const newCharacters = prevCharacters.map(
            (c: Record<string, unknown>) => ({
              session_id: session.id,
              user_id: c.user_id,
              name: c.name,
              race: c.race,
              class: c.class,
              level: c.level,
              stats: c.stats,
              hit_points: c.hit_points,
              armor_class: c.armor_class,
              inventory: c.inventory,
              abilities: c.abilities,
              backstory: c.backstory,
              status: 'active',
            }),
          );

          await supabaseAdmin.from('characters').insert(newCharacters);
        }
      }
    }

    res.status(201).json({ data: session });
  } catch (err) {
    next(err);
  }
});

// ─── PUT /api/campaigns/:id/sessions/:sessionId/link ────

router.put(
  '/:id/sessions/:sessionId/link',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id: campaignId, sessionId } = req.params;
      const userId = req.user!.id;

      // 캠페인 소유자 확인
      const { data: campaign } = await supabaseAdmin
        .from('campaigns')
        .select('created_by')
        .eq('id', campaignId)
        .single();

      if (!campaign) {
        throw new AppError(404, '캠페인을 찾을 수 없습니다.');
      }

      if (campaign.created_by !== userId) {
        throw new AppError(403, '캠페인 생성자만 세션을 연결할 수 있습니다.');
      }

      // 세션 소유자 확인
      const { data: session } = await supabaseAdmin
        .from('game_sessions')
        .select('created_by, campaign_id')
        .eq('id', sessionId)
        .single();

      if (!session) {
        throw new AppError(404, '세션을 찾을 수 없습니다.');
      }

      if (session.created_by !== userId) {
        throw new AppError(403, '본인이 생성한 세션만 연결할 수 있습니다.');
      }

      if (session.campaign_id) {
        throw new AppError(400, '이미 다른 캠페인에 연결된 세션입니다.');
      }

      // 현재 캠페인의 최대 순서
      const { data: lastSession } = await supabaseAdmin
        .from('game_sessions')
        .select('session_order')
        .eq('campaign_id', campaignId)
        .order('session_order', { ascending: false })
        .limit(1)
        .single();

      const nextOrder = (lastSession?.session_order ?? 0) + 1;

      // 세션 연결
      const { error } = await supabaseAdmin
        .from('game_sessions')
        .update({
          campaign_id: campaignId,
          session_order: nextOrder,
          updated_at: new Date().toISOString(),
        })
        .eq('id', sessionId);

      if (error) {
        throw new AppError(500, `세션 연결 실패: ${error.message}`);
      }

      res.json({ data: { linked: true } });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
