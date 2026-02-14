import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabase';
import { encrypt, decrypt, createKeyHint } from '../lib/crypto';
import { AppError } from '../middleware/errorHandler';
import {
  listProviderModels,
  ModelCatalogError,
  type ProviderModelCatalog,
} from '../services/llm/modelCatalog';
import { getRedisClient } from '../services/redis';
import type { LLMProviderId } from '../services/llm/provider';

const router = Router();

// API 키 등록 스키마
const registerKeySchema = z.object({
  provider: z.enum(['claude', 'openai', 'gemini']),
  apiKey: z.string().min(10).max(500),
});

const rotateKeySchema = z.object({
  apiKey: z.string().min(10).max(500),
});

const providerParamSchema = z.object({
  provider: z.enum(['claude', 'openai', 'gemini']),
});

type ValidationResultCode = 'VALID' | 'INVALID_KEY' | 'SERVICE_UNAVAILABLE' | 'UNKNOWN';

type ValidationResult = {
  isValid: boolean;
  message: string;
  code: ValidationResultCode;
};

function classifyValidationError(error: unknown): ValidationResult {
  const status =
    (error as { status?: unknown; statusCode?: unknown; code?: unknown }).status ??
    (error as { status?: unknown; statusCode?: unknown; code?: unknown }).statusCode;
  const normalizedStatus = typeof status === 'string' ? Number.parseInt(status, 10) : status;
  const errorCode = (error as { code?: unknown }).code;
  const message = String((error as { message?: unknown }).message ?? '').toLowerCase();

  const timeoutOrNetwork =
    errorCode === 'ETIMEDOUT' ||
    errorCode === 'ECONNRESET' ||
    errorCode === 'ECONNREFUSED' ||
    errorCode === 'ENOTFOUND' ||
    errorCode === 'EAI_AGAIN' ||
    errorCode === 'ENETUNREACH' ||
    message.includes('timeout') ||
    message.includes('network') ||
    message.includes('connection');

  if (
    normalizedStatus === 401 ||
    normalizedStatus === 403 ||
    message.includes('invalid api key') ||
    message.includes('invalid key') ||
    message.includes('invalid_api_key') ||
    message.includes('forbidden') ||
    message.includes('unauthorized')
  ) {
    return {
      isValid: false,
      message: 'API 키가 유효하지 않습니다.',
      code: 'INVALID_KEY',
    };
  }

  if (
    normalizedStatus === 429 ||
    (typeof normalizedStatus === 'number' && normalizedStatus >= 500) ||
    timeoutOrNetwork
  ) {
    return {
      isValid: false,
      message: 'API 키 검증 서비스에 일시적으로 연결할 수 없습니다.',
      code: 'SERVICE_UNAVAILABLE',
    };
  }

  return {
    isValid: false,
    message: 'API 키 검증 중 오류가 발생했습니다.',
    code: 'UNKNOWN',
  };
}

// 프로바이더별 API 키 간단 검증
async function quickValidate(
  provider: LLMProviderId,
  apiKey: string,
): Promise<ValidationResult> {
  try {
    if (provider === 'openai') {
      const { default: OpenAI } = await import('openai');
      const client = new OpenAI({ apiKey });
      await client.models.list();
      return { isValid: true, message: 'API 키가 유효합니다.', code: 'VALID' };
    } else if (provider === 'claude') {
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      const client = new Anthropic({ apiKey });
      await client.models.list();
      return { isValid: true, message: 'API 키가 유효합니다.', code: 'VALID' };
    } else if (provider === 'gemini') {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
      await model.generateContent('test');
      return { isValid: true, message: 'API 키가 유효합니다.', code: 'VALID' };
    }
    return { isValid: false, message: '지원하지 않는 프로바이더입니다.', code: 'INVALID_KEY' };
  } catch (error) {
    return classifyValidationError(error);
  }
}

const MODEL_LIST_CACHE_TTL_MS = 60_000;
const modelListCache = new Map<string, { expiresAt: number; data: ProviderModelCatalog }>();
const MODEL_LIST_CACHE_TTL_SECONDS = Math.max(1, Math.floor(MODEL_LIST_CACHE_TTL_MS / 1000));
const MODEL_LIST_CACHE_KEY_PREFIX = 'api-keys:model-list';
const isTestEnv = process.env.NODE_ENV === 'test';

function redisCacheKey(userId: string, provider: LLMProviderId): string {
  return `${MODEL_LIST_CACHE_KEY_PREFIX}:${userId}:${provider}`;
}

function cacheKey(userId: string, provider: LLMProviderId): string {
  return `${userId}:${provider}`;
}

function getMemoryCachedModelList(
  userId: string,
  provider: LLMProviderId,
): ProviderModelCatalog | null {
  const key = cacheKey(userId, provider);
  const cached = modelListCache.get(key);

  if (!cached) {
    return null;
  }

  if (cached.expiresAt <= Date.now()) {
    modelListCache.delete(key);
    return null;
  }

  return cached.data;
}

function setMemoryModelListCache(
  userId: string,
  provider: LLMProviderId,
  data: ProviderModelCatalog,
): void {
  modelListCache.set(cacheKey(userId, provider), {
    expiresAt: Date.now() + MODEL_LIST_CACHE_TTL_MS,
    data,
  });
}

function deleteMemoryModelListCache(userId: string, provider: LLMProviderId): void {
  modelListCache.delete(cacheKey(userId, provider));
}

async function getModelListCache(
  userId: string,
  provider: LLMProviderId,
): Promise<ProviderModelCatalog | null> {
  if (isTestEnv) {
    return getMemoryCachedModelList(userId, provider);
  }

  try {
    const client = getRedisClient();
    const raw = await client.get(redisCacheKey(userId, provider));

    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw) as ProviderModelCatalog;
    } catch {
      await client.del(redisCacheKey(userId, provider));
      return getMemoryCachedModelList(userId, provider);
    }
  } catch {
    return getMemoryCachedModelList(userId, provider);
  }
}

async function setModelListCache(
  userId: string,
  provider: LLMProviderId,
  data: ProviderModelCatalog,
): Promise<void> {
  if (isTestEnv) {
    setMemoryModelListCache(userId, provider, data);
    return;
  }

  try {
    const client = getRedisClient();
    await client.set(redisCacheKey(userId, provider), JSON.stringify(data), 'EX', MODEL_LIST_CACHE_TTL_SECONDS);
  } catch {
    setMemoryModelListCache(userId, provider, data);
    // fallback to memory cache only when Redis is unavailable
  }
}

async function invalidateModelCache(userId: string, provider: LLMProviderId): Promise<void> {
  deleteMemoryModelListCache(userId, provider);

  if (isTestEnv) {
    return;
  }

  try {
    const client = getRedisClient();
    await client.del(redisCacheKey(userId, provider));
  } catch {
    return;
  }
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
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('user_api_keys')
      .select('id')
      .eq('user_id', userId)
      .eq('provider', provider)
      .is('deleted_at', null)
      .maybeSingle();

    if (fetchError) {
      throw new AppError(500, `기존 키 조회 실패: ${fetchError.message}`);
    }

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
          previous_encrypted_key: null,
          previous_iv: null,
          previous_auth_tag: null,
          previous_key_hint: null,
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

    await invalidateModelCache(userId, provider);

    // 등록 후 자동 검증
    let autoValidation: ValidationResult = {
      isValid: false,
      message: '자동 검증 실패',
      code: 'UNKNOWN',
    };
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

// POST /api/keys/:provider/rotate — 기존 키를 새 키로 교체 + 롤백용 이전 키 보관
router.post('/:provider/rotate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const parsedProvider = providerParamSchema.safeParse(req.params);
    if (!parsedProvider.success) {
      throw new AppError(400, `provider 파라미터가 올바르지 않습니다: ${parsedProvider.error.message}`);
    }

    const parsedBody = rotateKeySchema.safeParse(req.body);
    if (!parsedBody.success) {
      throw new AppError(400, `요청 데이터가 올바르지 않습니다: ${parsedBody.error.message}`);
    }

    const provider = parsedProvider.data.provider;
    const { apiKey } = parsedBody.data;

    const { data: currentRecord, error: fetchError } = await supabaseAdmin
      .from('user_api_keys')
      .select(
        'id, encrypted_key, iv, auth_tag, key_hint, previous_key_hint, previous_encrypted_key, previous_iv, previous_auth_tag',
      )
      .eq('user_id', userId)
      .eq('provider', provider)
      .is('deleted_at', null)
      .maybeSingle();

    if (fetchError) {
      throw new AppError(500, `기존 API 키 조회 실패: ${fetchError.message}`);
    }

    if (!currentRecord) {
      throw new AppError(404, `${provider} API 키가 등록되지 않았습니다.`, true, 'KEY_NOT_FOUND');
    }

    const autoValidation = await quickValidate(provider, apiKey);
    if (!autoValidation.isValid) {
      const status = autoValidation.code === 'SERVICE_UNAVAILABLE' ? 503 : 400;
      throw new AppError(status, autoValidation.message, true, autoValidation.code);
    }

    const encrypted = encrypt(apiKey);
    const keyHint = createKeyHint(apiKey);

    const { data: updated, error: updateError } = await supabaseAdmin
      .from('user_api_keys')
      .update({
        previous_encrypted_key: currentRecord.encrypted_key,
        previous_iv: currentRecord.iv,
        previous_auth_tag: currentRecord.auth_tag,
        previous_key_hint: currentRecord.key_hint,
        encrypted_key: encrypted.encryptedKey,
        iv: encrypted.iv,
        auth_tag: encrypted.authTag,
        key_hint: keyHint,
        is_valid: autoValidation.isValid,
      })
      .eq('id', currentRecord.id)
      .select('id, provider, key_hint, is_valid, created_at, updated_at')
      .single();

    if (updateError) {
      throw new AppError(500, `API 키 회전 실패: ${updateError.message}`);
    }

    await invalidateModelCache(userId, provider);

    res.json({
      data: {
        ...updated,
        autoValidation,
        rotation: {
          rotated: true,
          previousKeyHint: currentRecord.key_hint,
          newKeyHint: keyHint,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/keys/:provider/rollback — 이전 키로 되돌리기
router.post('/:provider/rollback', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const parsedProvider = providerParamSchema.safeParse(req.params);
    if (!parsedProvider.success) {
      throw new AppError(400, `provider 파라미터가 올바르지 않습니다: ${parsedProvider.error.message}`);
    }

    const provider = parsedProvider.data.provider;

    const { data: currentRecord, error: fetchError } = await supabaseAdmin
      .from('user_api_keys')
      .select(
        'id, key_hint, previous_key_hint, encrypted_key, iv, auth_tag, previous_encrypted_key, previous_iv, previous_auth_tag',
      )
      .eq('user_id', userId)
      .eq('provider', provider)
      .is('deleted_at', null)
      .maybeSingle();

    if (fetchError) {
      throw new AppError(500, `기존 API 키 조회 실패: ${fetchError.message}`);
    }

    if (!currentRecord) {
      throw new AppError(404, `${provider} API 키가 등록되지 않았습니다.`, true, 'KEY_NOT_FOUND');
    }

    if (
      currentRecord.previous_encrypted_key == null ||
      currentRecord.previous_iv == null ||
      currentRecord.previous_auth_tag == null ||
      currentRecord.previous_key_hint == null
    ) {
      throw new AppError(400, `롤백 가능한 이전 키가 없습니다.`, true, 'NO_PREVIOUS_KEY');
    }

    const { data: rolledBack, error: rollbackError } = await supabaseAdmin
      .from('user_api_keys')
      .update({
        encrypted_key: currentRecord.previous_encrypted_key,
        iv: currentRecord.previous_iv,
        auth_tag: currentRecord.previous_auth_tag,
        key_hint: currentRecord.previous_key_hint,
        is_valid: null,
        previous_encrypted_key: null,
        previous_iv: null,
        previous_auth_tag: null,
        previous_key_hint: null,
      })
      .eq('id', currentRecord.id)
      .select('id, provider, key_hint, is_valid, created_at, updated_at')
      .single();

    if (rollbackError) {
      throw new AppError(500, `API 키 롤백 실패: ${rollbackError.message}`);
    }

    await invalidateModelCache(userId, provider);

    res.json({
      data: {
        ...rolledBack,
        rotation: {
          rolledBack: true,
          restoredKeyHint: currentRecord.previous_key_hint,
          previousKeyHint: currentRecord.key_hint,
        },
      },
    });
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
      .select('id, provider, key_hint, previous_key_hint, is_valid, created_at, updated_at')
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
    const cached = await getModelListCache(userId, provider);
    if (cached) {
      res.json({ data: cached });
      return;
    }

    // soft-delete 제외
    const { data: keyRecord, error } = await supabaseAdmin
      .from('user_api_keys')
      .select('encrypted_key, iv, auth_tag')
      .eq('user_id', userId)
      .eq('provider', provider)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) {
      throw new AppError(500, `API 키 조회 실패: ${error.message}`);
    }

    if (!keyRecord) {
      throw new AppError(404, `${provider} API 키가 등록되지 않았습니다.`, true, 'KEY_NOT_FOUND');
    }

    const apiKey = decrypt(keyRecord.encrypted_key, keyRecord.iv, keyRecord.auth_tag);
    let data: ProviderModelCatalog;

    try {
      data = await listProviderModels(provider, apiKey);
    } catch (error) {
      if (error instanceof ModelCatalogError) {
        if (error.code === 'INVALID_KEY') {
          throw new AppError(401, error.message, true, 'INVALID_KEY');
        }
        if (error.code === 'SERVICE_UNAVAILABLE' || error.code === 'UNKNOWN') {
          throw new AppError(503, error.message, true, 'SERVICE_UNAVAILABLE');
        }
      }

      throw new AppError(500, `${provider} 모델 목록 조회에 실패했습니다.`, true, 'MODEL_LIST_ERROR');
    }

    await setModelListCache(userId, provider, data);

    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/keys/:provider — API 키 삭제
router.delete('/:provider', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const parsed = providerParamSchema.safeParse(req.params);
    if (!parsed.success) {
      throw new AppError(400, `provider 파라미터가 올바르지 않습니다: ${parsed.error.message}`);
    }

    const provider = parsed.data.provider;

    // soft delete (이미 삭제된 키 제외)
    const { data: deleted, error } = await supabaseAdmin
      .from('user_api_keys')
      .update({ deleted_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('provider', provider)
      .is('deleted_at', null)
      .select('id');

    if (error) {
      throw new AppError(500, `API 키 삭제 실패: ${error.message}`);
    }

    if (!deleted || deleted.length === 0) {
      throw new AppError(404, `${provider} API 키가 등록되지 않았습니다.`, true, 'KEY_NOT_FOUND');
    }

    await invalidateModelCache(userId, provider);

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
    const { data: keyRecord, error } = await supabaseAdmin
      .from('user_api_keys')
      .select('id, encrypted_key, iv, auth_tag')
      .eq('user_id', userId)
      .eq('provider', provider)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) {
      throw new AppError(500, `API 키 조회 실패: ${error.message}`);
    }

    if (!keyRecord) {
      throw new AppError(404, `${provider} API 키가 등록되지 않았습니다.`, true, 'KEY_NOT_FOUND');
    }

    // 키 복호화 후 quickValidate로 검증
    const apiKey = decrypt(keyRecord.encrypted_key, keyRecord.iv, keyRecord.auth_tag);
    const { isValid, message, code } = await quickValidate(provider, apiKey);

    // 검증 결과 저장
    await supabaseAdmin.from('user_api_keys').update({ is_valid: isValid }).eq('id', keyRecord.id);

    res.json({
      data: {
        provider,
        isValid,
        message,
        code,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
