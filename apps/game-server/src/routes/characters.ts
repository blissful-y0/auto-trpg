import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabase';
import { AppError } from '../middleware/errorHandler';
import { assertSessionParticipant } from '../lib/authorization';

const router = Router();

// 캐릭터 생성 스키마
const createCharacterSchema = z.object({
  name: z.string().min(1).max(100),
  race: z.string().min(1).max(50),
  class: z.string().min(1).max(50),
  stats: z.record(z.number()).optional(),
  backstory: z.string().max(5000).optional(),
});

// POST /api/sessions/:sessionId/characters — 캐릭터 생성
router.post(
  '/sessions/:sessionId/characters',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { sessionId } = req.params;
      const userId = req.user!.id;

      // 세션 존재 확인
      const { data: session } = await supabaseAdmin
        .from('game_sessions')
        .select('id, status')
        .eq('id', sessionId)
        .single();

      if (!session) {
        throw new AppError(404, '세션을 찾을 수 없습니다.');
      }

      // 참가자 확인
      const { data: participant } = await supabaseAdmin
        .from('session_participants')
        .select('id, character_id')
        .eq('session_id', sessionId)
        .eq('user_id', userId)
        .single();

      if (!participant) {
        throw new AppError(403, '세션에 참가한 후 캐릭터를 생성할 수 있습니다.');
      }

      if (participant.character_id) {
        throw new AppError(409, '이미 캐릭터가 존재합니다.');
      }

      const parsed = createCharacterSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(400, `요청 데이터가 올바르지 않습니다: ${parsed.error.message}`);
      }

      const { name, race, class: charClass, stats, backstory } = parsed.data;

      // 캐릭터 생성
      const { data: character, error: charError } = await supabaseAdmin
        .from('characters')
        .insert({
          session_id: sessionId,
          user_id: userId,
          name,
          race,
          class: charClass,
          stats: stats || {},
          backstory: backstory || '',
        })
        .select()
        .single();

      if (charError || !character) {
        throw new AppError(500, `캐릭터 생성 실패: ${charError?.message}`);
      }

      // 참가자에 캐릭터 연결
      await supabaseAdmin
        .from('session_participants')
        .update({ character_id: character.id })
        .eq('id', participant.id);

      res.status(201).json({ data: character });
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/sessions/:sessionId/characters — 세션 캐릭터 목록
router.get(
  '/sessions/:sessionId/characters',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { sessionId } = req.params;
      const userId = req.user!.id;

      // 참가자 확인 (IDOR 방지: 참가자만 세션 캐릭터 목록 조회 가능)
      await assertSessionParticipant(sessionId as string, userId);

      const { data: characters, error } = await supabaseAdmin
        .from('characters')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true });

      if (error) {
        throw new AppError(500, `캐릭터 목록 조회 실패: ${error.message}`);
      }

      res.json({ data: characters || [] });
    } catch (err) {
      next(err);
    }
  },
);

// 캐릭터 수정 스키마
const updateCharacterSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  stats: z.record(z.number()).optional(),
  backstory: z.string().max(5000).optional(),
  hitPoints: z
    .object({
      current: z.number().int(),
      max: z.number().int(),
      temp: z.number().int().optional(),
    })
    .optional(),
  status: z.string().max(50).optional(),
});

// PATCH /api/characters/:id — 캐릭터 수정 (본인만)
router.patch('/characters/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    // 본인 캐릭터 확인
    const { data: character } = await supabaseAdmin
      .from('characters')
      .select('user_id')
      .eq('id', id)
      .single();

    if (!character) {
      throw new AppError(404, '캐릭터를 찾을 수 없습니다.');
    }

    if (character.user_id !== userId) {
      throw new AppError(403, '본인의 캐릭터만 수정할 수 있습니다.');
    }

    const parsed = updateCharacterSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, `요청 데이터가 올바르지 않습니다: ${parsed.error.message}`);
    }

    // Zod 필드명 → DB 컬럼명 매핑
    const { hitPoints, ...rest } = parsed.data;
    const updatePayload: Record<string, unknown> = { ...rest };
    if (hitPoints) {
      updatePayload.hit_points = hitPoints;
    }

    const { data: updated, error } = await supabaseAdmin
      .from('characters')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new AppError(500, `캐릭터 수정 실패: ${error.message}`);
    }

    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
});

// GET /api/characters/:id — 캐릭터 상세
router.get('/characters/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const { data: character, error } = await supabaseAdmin
      .from('characters')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !character) {
      throw new AppError(404, '캐릭터를 찾을 수 없습니다.');
    }

    // 참가자 확인 (IDOR 방지: 해당 캐릭터 세션의 참가자만 조회 가능)
    await assertSessionParticipant(character.session_id, userId);

    res.json({ data: character });
  } catch (err) {
    next(err);
  }
});

export default router;
