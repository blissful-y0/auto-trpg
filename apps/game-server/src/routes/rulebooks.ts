import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';
import { supabaseAdmin } from '../lib/supabase';
import { config } from '../config';
import { AppError } from '../middleware/errorHandler';
import { assertRulebookAccess } from '../lib/authorization';

const router = Router();

// S3 클라이언트 초기화
const s3Client = new S3Client({
  region: config.aws.region,
  credentials: {
    accessKeyId: config.aws.accessKeyId,
    secretAccessKey: config.aws.secretAccessKey,
  },
});

// 규칙서 업로드 요청 스키마
const uploadRulebookSchema = z.object({
  fileName: z.string().min(1).max(255),
  fileType: z.string().refine((v) => v === 'application/pdf', {
    message: 'PDF 파일만 업로드 가능합니다.',
  }),
  fileSize: z
    .number()
    .int()
    .min(1)
    .max(100 * 1024 * 1024), // 최대 100MB
  title: z.string().min(1).max(200),
  gameSystem: z.string().min(1).max(50).optional(),
});

// POST /api/rulebooks/upload — 규칙서 업로드 (S3 presigned URL 반환)
router.post('/upload', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;

    const parsed = uploadRulebookSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, `요청 데이터가 올바르지 않습니다: ${parsed.error.message}`);
    }

    const { fileName, fileType, fileSize, title, gameSystem } = parsed.data;

    // S3 키 생성
    const fileId = uuidv4();
    const s3Key = `rulebooks/${userId}/${fileId}/${fileName}`;

    // Presigned URL 생성 (15분 유효)
    const command = new PutObjectCommand({
      Bucket: config.aws.s3Bucket,
      Key: s3Key,
      ContentType: fileType,
      ContentLength: fileSize,
    });

    const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 900 });

    // 규칙서 메타데이터 저장
    const { data: rulebook, error } = await supabaseAdmin
      .from('rulebooks')
      .insert({
        user_id: userId,
        title,
        file_name: fileName,
        file_size: fileSize,
        s3_key: s3Key,
        game_system: gameSystem || null,
        status: 'uploading',
      })
      .select()
      .single();

    if (error || !rulebook) {
      throw new AppError(500, `규칙서 메타데이터 저장 실패: ${error?.message}`);
    }

    res.status(201).json({
      data: {
        rulebook,
        uploadUrl: presignedUrl,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/rulebooks/:id/process — 규칙서 처리 시작
router.post('/:id/process', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    // 규칙서 소유자 확인
    const { data: rulebook } = await supabaseAdmin
      .from('rulebooks')
      .select('id, user_id, status')
      .eq('id', id)
      .single();

    if (!rulebook) {
      throw new AppError(404, '규칙서를 찾을 수 없습니다.');
    }

    if (rulebook.user_id !== userId) {
      throw new AppError(403, '본인의 규칙서만 처리할 수 있습니다.');
    }

    if (rulebook.status !== 'uploading' && rulebook.status !== 'error') {
      throw new AppError(400, `현재 상태(${rulebook.status})에서는 처리를 시작할 수 없습니다.`);
    }

    // 상태를 processing으로 변경
    const { data: updated, error } = await supabaseAdmin
      .from('rulebooks')
      .update({ status: 'processing' })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new AppError(500, `상태 변경 실패: ${error.message}`);
    }

    // TODO: Lambda 함수 호출로 실제 처리 시작 (Phase 1.7에서 구현)

    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
});

// GET /api/rulebooks — 내 규칙서 목록
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;

    const { data: rulebooks, error } = await supabaseAdmin
      .from('rulebooks')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new AppError(500, `규칙서 목록 조회 실패: ${error.message}`);
    }

    res.json({ data: rulebooks || [] });
  } catch (err) {
    next(err);
  }
});

// GET /api/rulebooks/:id — 규칙서 상세 + 청크 수
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    // 접근 권한 확인 (IDOR 방지: 소유자 또는 연결된 세션 참가자만 조회 가능)
    await assertRulebookAccess(id as string, userId);

    const { data: rulebook, error } = await supabaseAdmin
      .from('rulebooks')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !rulebook) {
      throw new AppError(404, '규칙서를 찾을 수 없습니다.');
    }

    // 청크 수 조회
    const { count } = await supabaseAdmin
      .from('rulebook_chunks')
      .select('id', { count: 'exact', head: true })
      .eq('rulebook_id', id);

    res.json({
      data: {
        ...rulebook,
        chunkCount: count || 0,
      },
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/rulebooks/:id — 규칙서 삭제
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    // 소유자 확인
    const { data: rulebook } = await supabaseAdmin
      .from('rulebooks')
      .select('id, user_id')
      .eq('id', id)
      .single();

    if (!rulebook) {
      throw new AppError(404, '규칙서를 찾을 수 없습니다.');
    }

    if (rulebook.user_id !== userId) {
      throw new AppError(403, '본인의 규칙서만 삭제할 수 있습니다.');
    }

    // 관련 청크 삭제
    await supabaseAdmin.from('rulebook_chunks').delete().eq('rulebook_id', id);

    // 세션 연결 삭제
    await supabaseAdmin.from('session_rulebooks').delete().eq('rulebook_id', id);

    // 규칙서 삭제
    const { error } = await supabaseAdmin.from('rulebooks').delete().eq('id', id);

    if (error) {
      throw new AppError(500, `규칙서 삭제 실패: ${error.message}`);
    }

    // TODO: S3 파일 삭제도 필요 (나중에 추가)

    res.json({ message: '규칙서가 삭제되었습니다.' });
  } catch (err) {
    next(err);
  }
});

export default router;
