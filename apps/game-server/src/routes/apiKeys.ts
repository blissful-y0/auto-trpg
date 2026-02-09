import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { supabaseAdmin } from '../lib/supabase';
import { config } from '../config';
import { AppError } from '../middleware/errorHandler';

const router = Router();

// AES-256-GCM 암호화/복호화 유틸리티
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;

function getEncryptionKey(): Buffer {
  // 32바이트 키 생성 (SHA-256 해시)
  return crypto.createHash('sha256').update(config.encryption.secret).digest();
}

function encrypt(plainText: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  // iv:authTag:encryptedData 형태로 저장
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

function decrypt(encryptedText: string): string {
  const key = getEncryptionKey();
  const parts = encryptedText.split(':');

  if (parts.length !== 3) {
    throw new Error('잘못된 암호화 데이터 형식입니다.');
  }

  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const encrypted = parts[2];

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

// API 키 힌트 생성 (앞 4자 + ... + 뒤 4자)
function createKeyHint(apiKey: string): string {
  if (apiKey.length <= 8) return '****';
  return `${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}`;
}

// API 키 등록 스키마
const registerKeySchema = z.object({
  provider: z.enum(['claude', 'openai', 'gemini']),
  apiKey: z.string().min(10).max(500),
});

// POST /api/keys — API 키 등록
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;

    const parsed = registerKeySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, `요청 데이터가 올바르지 않습니다: ${parsed.error.message}`);
    }

    const { provider, apiKey } = parsed.data;

    // 기존 키가 있으면 업데이트
    const { data: existing } = await supabaseAdmin
      .from('user_api_keys')
      .select('id')
      .eq('user_id', userId)
      .eq('provider', provider)
      .single();

    const encryptedKey = encrypt(apiKey);
    const keyHint = createKeyHint(apiKey);

    if (existing) {
      const { data: updated, error } = await supabaseAdmin
        .from('user_api_keys')
        .update({
          encrypted_key: encryptedKey,
          key_hint: keyHint,
          is_valid: null, // 재검증 필요
        })
        .eq('id', existing.id)
        .select('id, provider, key_hint, is_valid, created_at, updated_at')
        .single();

      if (error) {
        throw new AppError(500, `API 키 업데이트 실패: ${error.message}`);
      }

      res.json({ data: updated });
    } else {
      const { data: created, error } = await supabaseAdmin
        .from('user_api_keys')
        .insert({
          user_id: userId,
          provider,
          encrypted_key: encryptedKey,
          key_hint: keyHint,
        })
        .select('id, provider, key_hint, is_valid, created_at, updated_at')
        .single();

      if (error) {
        throw new AppError(500, `API 키 등록 실패: ${error.message}`);
      }

      res.status(201).json({ data: created });
    }
  } catch (err) {
    next(err);
  }
});

// GET /api/keys — 내 API 키 목록 (힌트만)
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;

    const { data: keys, error } = await supabaseAdmin
      .from('user_api_keys')
      .select('id, provider, key_hint, is_valid, created_at, updated_at')
      .eq('user_id', userId)
      .order('provider', { ascending: true });

    if (error) {
      throw new AppError(500, `API 키 목록 조회 실패: ${error.message}`);
    }

    res.json({ data: keys || [] });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/keys/:provider — API 키 삭제
router.delete('/:provider', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { provider } = req.params;

    const { error } = await supabaseAdmin
      .from('user_api_keys')
      .delete()
      .eq('user_id', userId)
      .eq('provider', provider);

    if (error) {
      throw new AppError(500, `API 키 삭제 실패: ${error.message}`);
    }

    res.json({ message: `${provider} API 키가 삭제되었습니다.` });
  } catch (err) {
    next(err);
  }
});

// POST /api/keys/:provider/validate — API 키 유효성 검증
router.post('/:provider/validate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { provider } = req.params;

    // 저장된 키 조회
    const { data: keyRecord } = await supabaseAdmin
      .from('user_api_keys')
      .select('id, encrypted_key')
      .eq('user_id', userId)
      .eq('provider', provider)
      .single();

    if (!keyRecord) {
      throw new AppError(404, `${provider} API 키가 등록되지 않았습니다.`);
    }

    // 키 복호화
    const apiKey = decrypt(keyRecord.encrypted_key);
    let isValid = false;

    // 프로바이더별 검증 (간단한 API 호출)
    try {
      if (provider === 'openai') {
        const { default: OpenAI } = await import('openai');
        const client = new OpenAI({ apiKey });
        await client.models.list();
        isValid = true;
      } else if (provider === 'claude') {
        const { default: Anthropic } = await import('@anthropic-ai/sdk');
        const client = new Anthropic({ apiKey });
        // 간단한 메시지 전송으로 검증
        await client.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'test' }],
        });
        isValid = true;
      } else if (provider === 'gemini') {
        const { GoogleGenerativeAI } = await import('@google/generative-ai');
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
        await model.generateContent('test');
        isValid = true;
      }
    } catch {
      isValid = false;
    }

    // 검증 결과 저장
    await supabaseAdmin
      .from('user_api_keys')
      .update({ is_valid: isValid })
      .eq('id', keyRecord.id);

    res.json({
      data: {
        provider,
        isValid,
        message: isValid ? 'API 키가 유효합니다.' : 'API 키가 유효하지 않습니다.',
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
