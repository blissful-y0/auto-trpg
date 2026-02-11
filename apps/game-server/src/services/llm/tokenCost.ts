// 모델별 토큰 가격표 + 세션 비용 리포트
// 가격 단위: USD per 1M tokens (2025-01 기준)

import type { SupabaseClient } from '@supabase/supabase-js';

interface ModelPricing {
  input: number;  // USD per 1M input tokens
  output: number; // USD per 1M output tokens
}

// 모델별 가격 (USD per 1M tokens)
const MODEL_PRICING: Record<string, ModelPricing> = {
  // OpenAI
  'gpt-4o':                    { input: 2.50,  output: 10.00 },
  'gpt-4o-mini':               { input: 0.15,  output: 0.60  },
  'text-embedding-3-small':    { input: 0.02,  output: 0     },
  // Claude
  'claude-sonnet-4-20250514':  { input: 3.00,  output: 15.00 },
  'claude-haiku-3-5-20241022': { input: 0.80,  output: 4.00  },
  // Gemini
  'gemini-2.0-flash':          { input: 0.10,  output: 0.40  },
};

// 가격을 모르는 모델은 보수적 추정
const FALLBACK_PRICING: ModelPricing = { input: 3.00, output: 15.00 };

function getPricing(model: string): ModelPricing {
  return MODEL_PRICING[model] ?? FALLBACK_PRICING;
}

// 단일 호출 비용 계산 (USD)
export function calculateCallCost(
  promptTokens: number,
  completionTokens: number,
  model: string,
): number {
  const pricing = getPricing(model);
  return (promptTokens * pricing.input + completionTokens * pricing.output) / 1_000_000;
}

// ── 세션 비용 리포트 ──

export interface TokenUsageEntry {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  model?: string;
  provider?: string;
  createdAt: string;
}

export interface ModelBreakdown {
  model: string;
  provider: string;
  callCount: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUSD: number;
}

export interface SessionCostReport {
  sessionId: string;
  totalCalls: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  estimatedCostUSD: number;
  estimatedCostKRW: number; // 대략적 원화 환산
  byModel: ModelBreakdown[];
  periodStart?: string;
  periodEnd?: string;
}

const USD_TO_KRW = 1_380; // 대략적 환율

export async function getSessionCostReport(
  supabaseClient: SupabaseClient,
  sessionId: string,
): Promise<SessionCostReport> {
  const { data, error } = await supabaseClient
    .from('game_events')
    .select('data, created_at')
    .eq('session_id', sessionId)
    .eq('event_type', 'token_usage')
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`토큰 사용량 조회 실패: ${error.message}`);
  }

  const entries: TokenUsageEntry[] = (data ?? []).map((row) => ({
    promptTokens: (row.data as Record<string, unknown>).promptTokens as number ?? 0,
    completionTokens: (row.data as Record<string, unknown>).completionTokens as number ?? 0,
    totalTokens: (row.data as Record<string, unknown>).totalTokens as number ?? 0,
    model: (row.data as Record<string, unknown>).model as string | undefined,
    provider: (row.data as Record<string, unknown>).provider as string | undefined,
    createdAt: row.created_at as string,
  }));

  // 모델별 집계
  const modelMap = new Map<string, ModelBreakdown>();

  for (const entry of entries) {
    const model = entry.model ?? 'unknown';
    const provider = entry.provider ?? 'unknown';
    const key = `${provider}/${model}`;

    const existing = modelMap.get(key) ?? {
      model,
      provider,
      callCount: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      estimatedCostUSD: 0,
    };

    modelMap.set(key, {
      ...existing,
      callCount: existing.callCount + 1,
      promptTokens: existing.promptTokens + entry.promptTokens,
      completionTokens: existing.completionTokens + entry.completionTokens,
      totalTokens: existing.totalTokens + entry.totalTokens,
      estimatedCostUSD: existing.estimatedCostUSD + calculateCallCost(
        entry.promptTokens,
        entry.completionTokens,
        model,
      ),
    });
  }

  const byModel = [...modelMap.values()].sort((a, b) => b.estimatedCostUSD - a.estimatedCostUSD);

  const totalPromptTokens = entries.reduce((sum, e) => sum + e.promptTokens, 0);
  const totalCompletionTokens = entries.reduce((sum, e) => sum + e.completionTokens, 0);
  const totalTokens = entries.reduce((sum, e) => sum + e.totalTokens, 0);
  const estimatedCostUSD = byModel.reduce((sum, m) => sum + m.estimatedCostUSD, 0);

  return {
    sessionId,
    totalCalls: entries.length,
    totalPromptTokens,
    totalCompletionTokens,
    totalTokens,
    estimatedCostUSD: Math.round(estimatedCostUSD * 10000) / 10000, // 소수점 4자리
    estimatedCostKRW: Math.round(estimatedCostUSD * USD_TO_KRW),
    byModel,
    periodStart: entries[0]?.createdAt,
    periodEnd: entries[entries.length - 1]?.createdAt,
  };
}

// 리포트를 읽기 좋은 텍스트로 포맷
export function formatCostReport(report: SessionCostReport): string {
  const lines: string[] = [
    `━━━ 세션 토큰 사용량 리포트 ━━━`,
    `세션: ${report.sessionId}`,
    `기간: ${report.periodStart ?? '-'} ~ ${report.periodEnd ?? '-'}`,
    ``,
    `📊 총 사용량`,
    `  LLM 호출 횟수: ${report.totalCalls}회`,
    `  입력 토큰: ${report.totalPromptTokens.toLocaleString()}`,
    `  출력 토큰: ${report.totalCompletionTokens.toLocaleString()}`,
    `  총 토큰: ${report.totalTokens.toLocaleString()}`,
    ``,
    `💰 예상 비용`,
    `  USD: $${report.estimatedCostUSD.toFixed(4)}`,
    `  KRW: ₩${report.estimatedCostKRW.toLocaleString()} (환율 ${USD_TO_KRW}원 기준)`,
  ];

  if (report.byModel.length > 0) {
    lines.push(``, `📋 모델별 내역`);
    for (const m of report.byModel) {
      lines.push(
        `  ${m.provider}/${m.model}`,
        `    ${m.callCount}회 | ${m.totalTokens.toLocaleString()} 토큰 | $${m.estimatedCostUSD.toFixed(4)}`,
      );
    }
  }

  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  return lines.join('\n');
}
