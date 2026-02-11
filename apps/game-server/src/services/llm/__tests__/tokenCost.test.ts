import { describe, it, expect } from 'vitest';
import { calculateCallCost, formatCostReport } from '../tokenCost';
import type { SessionCostReport } from '../tokenCost';

describe('tokenCost', () => {
  describe('calculateCallCost', () => {
    it('GPT-4o 비용 계산', () => {
      // 1000 input + 500 output
      // input: 1000 * 2.50 / 1M = 0.0025
      // output: 500 * 10.00 / 1M = 0.005
      const cost = calculateCallCost(1000, 500, 'gpt-4o');
      expect(cost).toBeCloseTo(0.0075, 4);
    });

    it('GPT-4o-mini는 훨씬 저렴', () => {
      const cost = calculateCallCost(1000, 500, 'gpt-4o-mini');
      // input: 1000 * 0.15 / 1M = 0.00015
      // output: 500 * 0.60 / 1M = 0.0003
      expect(cost).toBeCloseTo(0.00045, 5);
    });

    it('Claude Sonnet 비용 계산', () => {
      const cost = calculateCallCost(2000, 1000, 'claude-sonnet-4-20250514');
      // input: 2000 * 3.00 / 1M = 0.006
      // output: 1000 * 15.00 / 1M = 0.015
      expect(cost).toBeCloseTo(0.021, 4);
    });

    it('Gemini Flash는 매우 저렴', () => {
      const cost = calculateCallCost(5000, 2000, 'gemini-2.0-flash');
      // input: 5000 * 0.10 / 1M = 0.0005
      // output: 2000 * 0.40 / 1M = 0.0008
      expect(cost).toBeCloseTo(0.0013, 4);
    });

    it('알 수 없는 모델은 보수적 추정 (비싼 쪽)', () => {
      const cost = calculateCallCost(1000, 500, 'unknown-model-xyz');
      // fallback: input 3.00, output 15.00
      // input: 1000 * 3.00 / 1M = 0.003
      // output: 500 * 15.00 / 1M = 0.0075
      expect(cost).toBeCloseTo(0.0105, 4);
    });

    it('토큰 0이면 비용 0', () => {
      expect(calculateCallCost(0, 0, 'gpt-4o')).toBe(0);
    });

    it('임베딩 모델은 output 비용 없음', () => {
      const cost = calculateCallCost(1000, 0, 'text-embedding-3-small');
      // input: 1000 * 0.02 / 1M = 0.00002
      expect(cost).toBeCloseTo(0.00002, 6);
    });
  });

  describe('formatCostReport', () => {
    it('리포트 텍스트 포맷', () => {
      const report: SessionCostReport = {
        sessionId: 'test-session-1',
        totalCalls: 5,
        totalPromptTokens: 10000,
        totalCompletionTokens: 5000,
        totalTokens: 15000,
        estimatedCostUSD: 0.0375,
        estimatedCostKRW: 52,
        byModel: [
          {
            model: 'gpt-4o',
            provider: 'openai',
            callCount: 3,
            promptTokens: 6000,
            completionTokens: 3000,
            totalTokens: 9000,
            estimatedCostUSD: 0.03,
          },
          {
            model: 'gpt-4o-mini',
            provider: 'openai',
            callCount: 2,
            promptTokens: 4000,
            completionTokens: 2000,
            totalTokens: 6000,
            estimatedCostUSD: 0.0075,
          },
        ],
        periodStart: '2025-01-15T10:00:00Z',
        periodEnd: '2025-01-15T11:30:00Z',
      };

      const text = formatCostReport(report);

      expect(text).toContain('세션 토큰 사용량 리포트');
      expect(text).toContain('test-session-1');
      expect(text).toContain('5회');
      expect(text).toContain('15,000');
      expect(text).toContain('$0.0375');
      expect(text).toContain('₩52');
      expect(text).toContain('openai/gpt-4o');
      expect(text).toContain('openai/gpt-4o-mini');
    });
  });
});
