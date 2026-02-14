import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabase';
import { encrypt, decrypt, createKeyHint } from '../lib/crypto';
import { AppError } from '../middleware/errorHandler';
import { listProviderModels, type ProviderModelCatalog } from '../services/llm/modelCatalog';
import type { LLMProviderId } from '../services/llm/provider';

const router = Router();

// API 키 등록 스키마
const registerKeySchema = z.object({
  provider: z.enum(['claude', 'openai', 'gemini']),
  apiKey: z.string().min(10).max(500),
});

const providerParamSchema = z.object({
  provider: z.enum(['claude', 'openai', 'gemini']),
});

// 프로바이더별 API 키 간단 검증
async function quickValidate(
  provider: string,
  apiKey: string,
): Promise<{ isValid: boolean; message: string }> {
  try {
    if (provider === 'openai') {
      const { default: OpenAI } = await import('openai');
      const client = new OpenAI({ apiKey });
      await client.models.list();
      return { isValid: true, message: 'API 키가 유효합니다.' };
    } else if (provider === 'claude') {
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      const client = new Anthropic({ apiKey });
      await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'test' }],
      });
      return { isValid: true, message: 'API 키가 유효합니다.' };
    } else if (provider === 'gemini') {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
      await model.generateContent('test');
      return { isValid: true, message: 'API 키가 유효합니다.' };
    }
    return { isValid: false, message: '지원하지 않는 프로바이더입니다.' };
  } catch {
    return { isValid: false, message: 'API 키가 유효하지 않습니다.' };
  }
}

const MODEL_LIST_CACHE_TTL_MS = 60_000;
const modelListCache = new Map<string, { expiresAt: number; data: ProviderModelCatalog }>();

function cacheKey(userId: string, provider: LLMProviderId): string {
  return `${userId}:${provider}`;
}

// POST /api/keys — API 키 등록
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;

    const parsed = registerKeySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, `요청 데이터가 올바르지 않습니다: ${parsed.error.message}`);
    }

    const { provider, apiKey } = parsed.data;

    // 기존 키가 있으면 업데이트 (soft-delete 제외)
    const { data: existing } = await supabaseAdmin
      .from('user_api_keys')
      .select('id')
      .eq('user_id', userId)
      .eq('provider', provider)
      .is('deleted_at', null)
      .single();

    const encrypted = encrypt(apiKey);
    const keyHint = createKeyHint(apiKey);

    let keyRecord: any;
    let statusCode = 200;

    if (existing) {
      const { data: updated, error } = await supabaseAdmin
        .from('user_api_keys')
        .update({
          encrypted_key: encrypted.encryptedKey,
          iv: encrypted.iv,
          auth_tag: encrypted.authTag,
          key_hint: keyHint,
          is_valid: null, // 재검증 필요
        })
        .eq('id', existing.id)
        .select('id, provider, key_hint, is_valid, created_at, updated_at')
        .single();

      if (error) {
        throw new AppError(500, `API 키 업데이트 실패: ${error.message}`);
      }
      keyRecord = updated;
    } else {
      const { data: created, error } = await supabaseAdmin
        .from('user_api_keys')
        .insert({
          user_id: userId,
          provider,
          encrypted_key: encrypted.encryptedKey,
          iv: encrypted.iv,
          auth_tag: encrypted.authTag,
          key_hint: keyHint,
        })
        .select('id, provider, key_hint, is_valid, created_at, updated_at')
        .single();

      if (error) {
        throw new AppError(500, `API 키 등록 실패: ${error.message}`);
      }
      keyRecord = created;
      statusCode = 201;
    }

    // 등록 후 자동 검증
    let autoValidation = { isValid: false, message: '자동 검증 실패' };
    try {
      autoValidation = await quickValidate(provider, apiKey);
      await supabaseAdmin
        .from('user_api_keys')
        .update({ is_valid: autoValidation.isValid })
        .eq('id', keyRecord.id);
      keyRecord.is_valid = autoValidation.isValid;
    } catch {
      // 자동 검증 실패해도 등록 자체는 성공으로 처리
    }

    res.status(statusCode).json({ data: { ...keyRecord, autoValidation } });
  } catch (err) {
    next(err);
  }
});

// GET /api/keys — 내 API 키 목록 (힌트만)
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;

    // soft-delete 제외
    const { data: keys, error } = await supabaseAdmin
      .from('user_api_keys')
      .select('id, provider, key_hint, is_valid, created_at, updated_at')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('provider', { ascending: true });

    if (error) {
      throw new AppError(500, `API 키 목록 조회 실패: ${error.message}`);
    }

    res.json({ data: keys || [] });
  } catch (err) {
    next(err);
  }
});

// GET /api/keys/:provider/models — 해당 프로바이더 최신 모델 목록
router.get('/:provider/models', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const parsed = providerParamSchema.safeParse(req.params);

    if (!parsed.success) {
      throw new AppError(400, `provider 파라미터가 올바르지 않습니다: ${parsed.error.message}`);
    }

    const provider = parsed.data.provider;
    const key = cacheKey(userId, provider);
    const cached = modelListCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      res.json({ data: cached.data });
      return;
    }

    // soft-delete 제외
    const { data: keyRecord } = await supabaseAdmin
      .from('user_api_keys')
      .select('encrypted_key, iv, auth_tag')
      .eq('user_id', userId)
      .eq('provider', provider)
      .is('deleted_at', null)
      .single();

    if (!keyRecord) {
      throw new AppError(404, `${provider} API 키가 등록되지 않았습니다.`);
    }

    const apiKey = decrypt(keyRecord.encrypted_key, keyRecord.iv, keyRecord.auth_tag);
    const data = await listProviderModels(provider, apiKey);

    modelListCache.set(key, {
      expiresAt: Date.now() + MODEL_LIST_CACHE_TTL_MS,
      data,
    });

    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/keys/:provider — API 키 삭제
router.delete('/:provider', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { provider } = req.params;

    // soft delete (이미 삭제된 키 제외)
    const { error } = await supabaseAdmin
      .from('user_api_keys')
      .update({ deleted_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('provider', provider)
      .is('deleted_at', null);

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
    const parsed = providerParamSchema.safeParse(req.params);
    if (!parsed.success) {
      throw new AppError(400, `provider 파라미터가 올바르지 않습니다: ${parsed.error.message}`);
    }
    const provider = parsed.data.provider;

    // 저장된 키 조회 (soft-delete 제외)
    const { data: keyRecord } = await supabaseAdmin
      .from('user_api_keys')
      .select('id, encrypted_key, iv, auth_tag')
      .eq('user_id', userId)
      .eq('provider', provider)
      .is('deleted_at', null)
      .single();

    if (!keyRecord) {
      throw new AppError(404, `${provider} API 키가 등록되지 않았습니다.`);
    }

    // 키 복호화 후 quickValidate로 검증
    const apiKey = decrypt(keyRecord.encrypted_key, keyRecord.iv, keyRecord.auth_tag);
    const { isValid, message } = await quickValidate(provider, apiKey);

    // 검증 결과 저장
    await supabaseAdmin.from('user_api_keys').update({ is_valid: isValid }).eq('id', keyRecord.id);

    res.json({
      data: { provider, isValid, message },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
