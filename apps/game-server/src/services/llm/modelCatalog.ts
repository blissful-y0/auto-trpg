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

const STATIC_GEMINI_MODELS: ProviderModelInfo[] = [
  { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
  { id: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash Lite' },
  { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
  { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
];

function normalizeModelList(items: string[]): ProviderModelInfo[] {
  const unique = Array.from(new Set(items.filter((item) => item && item.trim().length > 0)));
  unique.sort((a, b) => a.localeCompare(b));
  return unique.map((id) => ({ id, label: id }));
}

async function listOpenAIModels(apiKey: string): Promise<ProviderModelCatalog> {
  const client = new OpenAI({ apiKey });
  const models = await client.models.list();
  const ids = models.data.map((m: { id: string }) => m.id);

  return {
    provider: 'openai',
    source: 'live',
    models: normalizeModelList(ids),
  };
}

async function listClaudeModels(apiKey: string): Promise<ProviderModelCatalog> {
  const client = new Anthropic({ apiKey });
  const models = await client.models.list({ limit: 1000 });
  const ids = models.data.map((m: { id: string }) => m.id);

  return {
    provider: 'claude',
    source: 'live',
    models: normalizeModelList(ids),
  };
}

async function listGeminiModels(apiKey: string): Promise<ProviderModelCatalog> {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;

  try {
    const response = await fetch(endpoint);
    if (!response.ok) {
      throw new Error(`Gemini models API error: HTTP ${response.status}`);
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
      return {
        provider: 'gemini',
        source: 'static',
        models: STATIC_GEMINI_MODELS,
      };
    }

    return {
      provider: 'gemini',
      source: 'live',
      models,
    };
  } catch {
    return {
      provider: 'gemini',
      source: 'static',
      models: STATIC_GEMINI_MODELS,
    };
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
