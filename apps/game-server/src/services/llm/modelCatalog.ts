import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

import type { LLMProviderId } from './provider';

export interface ProviderModelInfo {
  id: string;
  label: string;
}

export interface ProviderModelCatalog {
  provider: LLMProviderId;
  source: 'live' | 'static';
  models: ProviderModelInfo[];
}

export type ModelCatalogErrorCode = 'INVALID_KEY' | 'SERVICE_UNAVAILABLE' | 'UNKNOWN';

export class ModelCatalogError extends Error {
  public readonly code: ModelCatalogErrorCode;
  public readonly provider: LLMProviderId;

  constructor(provider: LLMProviderId, code: ModelCatalogErrorCode, message: string) {
    super(message);
    this.name = 'ModelCatalogError';
    this.provider = provider;
    this.code = code;
  }
}

const STATIC_GEMINI_MODELS: ProviderModelInfo[] = [
  { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
  { id: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash Lite' },
  { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
  { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
];

const GEMINI_MODELS_FETCH_TIMEOUT_MS = 5000;
const MODEL_LIST_TIMEOUT_MS = 5000;

function classifyModelCatalogError(error: unknown): ModelCatalogErrorCode {
  const status =
    (error as { status?: unknown; statusCode?: unknown }).status ??
    (error as { status?: unknown; statusCode?: unknown }).statusCode;
  const normalizedStatus = typeof status === 'string' ? Number.parseInt(status, 10) : status;
  const errorCode = (error as { code?: unknown }).code;
  const message = String((error as { message?: unknown }).message ?? '').toLowerCase();

  if (
    normalizedStatus === 401 ||
    normalizedStatus === 403 ||
    message.includes('invalid api key') ||
    message.includes('invalid key') ||
    message.includes('invalid_api_key') ||
    message.includes('forbidden') ||
    message.includes('unauthorized')
  ) {
    return 'INVALID_KEY';
  }

  if (
    normalizedStatus === 429 ||
    (typeof normalizedStatus === 'number' && normalizedStatus >= 500) ||
    errorCode === 'ETIMEDOUT' ||
    errorCode === 'ECONNRESET' ||
    errorCode === 'ECONNREFUSED' ||
    errorCode === 'ENOTFOUND' ||
    errorCode === 'EAI_AGAIN' ||
    errorCode === 'ENETUNREACH' ||
    message.includes('timeout') ||
    message.includes('network') ||
    message.includes('connection')
  ) {
    return 'SERVICE_UNAVAILABLE';
  }

  return 'UNKNOWN';
}

async function withTimeout<T>(task: () => Promise<T>, timeoutMs = MODEL_LIST_TIMEOUT_MS): Promise<T> {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    return await Promise.race([
      task(),
      new Promise<T>((_, reject) => {
        controller.signal.addEventListener('abort', () => {
          reject(new Error(`operation timeout after ${timeoutMs}ms`));
        });
      }),
    ]);
  } finally {
    clearTimeout(timeoutHandle);
  }
}

function formatModelCatalogErrorMessage(provider: LLMProviderId, code: ModelCatalogErrorCode): string {
  if (code === 'INVALID_KEY') {
    return `${provider} API 키가 유효하지 않습니다.`;
  }
  if (code === 'SERVICE_UNAVAILABLE') {
    return `${provider} 모델 목록 조회가 일시적으로 불가합니다.`;
  }
  return `${provider} 모델 목록 조회 중 오류가 발생했습니다.`;
}

function normalizeModelList(items: string[]): ProviderModelInfo[] {
  const unique = Array.from(new Set(items.filter((item) => item && item.trim().length > 0)));
  unique.sort((a, b) => a.localeCompare(b));
  return unique.map((id) => ({ id, label: id }));
}

async function listOpenAIModels(apiKey: string): Promise<ProviderModelCatalog> {
  const client = new OpenAI({ apiKey });
  try {
    const models = await withTimeout(() => client.models.list(), MODEL_LIST_TIMEOUT_MS);
    const ids = models.data.map((m: { id: string }) => m.id);

    return {
      provider: 'openai',
      source: 'live',
      models: normalizeModelList(ids),
    };
  } catch (error) {
    const code = classifyModelCatalogError(error);
    throw new ModelCatalogError('openai', code, formatModelCatalogErrorMessage('openai', code));
  }
}

async function listClaudeModels(apiKey: string): Promise<ProviderModelCatalog> {
  const client = new Anthropic({ apiKey });
  try {
    const models = await withTimeout(() => client.models.list({ limit: 1000 }), MODEL_LIST_TIMEOUT_MS);
    const ids = models.data.map((m: { id: string }) => m.id);

    return {
      provider: 'claude',
      source: 'live',
      models: normalizeModelList(ids),
    };
  } catch (error) {
    const code = classifyModelCatalogError(error);
    throw new ModelCatalogError('claude', code, formatModelCatalogErrorMessage('claude', code));
  }
}

async function listGeminiModels(apiKey: string): Promise<ProviderModelCatalog> {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, GEMINI_MODELS_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(endpoint, { signal: controller.signal });
    if (!response.ok) {
      const err: Error & { status?: number } = new Error(`Gemini models API error: HTTP ${response.status}`);
      err.status = response.status;
      throw err;
    }

    const payload = (await response.json()) as {
      models?: Array<{ name?: string; displayName?: string }>;
    };

    const models = (payload.models ?? [])
      .map((m) => {
        const raw = m.name ?? '';
        const id = raw.startsWith('models/') ? raw.slice('models/'.length) : raw;
        return {
          id,
          label: m.displayName || id,
        };
      })
      .filter((m) => m.id.length > 0)
      .sort((a, b) => a.id.localeCompare(b.id));

    if (models.length === 0) {
      throw new ModelCatalogError('gemini', 'UNKNOWN', formatModelCatalogErrorMessage('gemini', 'UNKNOWN'));
    }

    return {
      provider: 'gemini',
      source: 'live',
      models,
    };
  } catch (error) {
    const code = classifyModelCatalogError(error);
    if (code === 'INVALID_KEY') {
      throw new ModelCatalogError('gemini', code, formatModelCatalogErrorMessage('gemini', code));
    }

    return {
      provider: 'gemini',
      source: 'static',
      models: STATIC_GEMINI_MODELS,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function listProviderModels(
  provider: LLMProviderId,
  apiKey: string,
): Promise<ProviderModelCatalog> {
  if (provider === 'openai') {
    return listOpenAIModels(apiKey);
  }

  if (provider === 'claude') {
    return listClaudeModels(apiKey);
  }

  return listGeminiModels(apiKey);
}
