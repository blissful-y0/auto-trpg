import { describe, it, expect } from 'vitest';
import { BudgetAllocator } from '../BudgetAllocator';
import type { BudgetProfile } from '../types';

describe('BudgetAllocator', () => {
  const allocator = new BudgetAllocator();

  const profiles: BudgetProfile[] = ['combat', 'exploration', 'roleplay', 'skill_check'];

  describe('allocate', () => {
    it.each(profiles)('%s 프로파일 — tier 합산이 total과 일치', (profile) => {
      const budget = allocator.allocate(profile);
      expect(budget.tier0 + budget.tier1 + budget.tier2 + budget.tier3).toBe(budget.total);
    });

    it.each(profiles)('%s 프로파일 — total ≤ 120000', (profile) => {
      const budget = allocator.allocate(profile);
      expect(budget.total).toBeLessThanOrEqual(120000);
    });

    it.each(profiles)('%s 프로파일 — 모든 tier > 0', (profile) => {
      const budget = allocator.allocate(profile);
      expect(budget.tier0).toBeGreaterThan(0);
      expect(budget.tier1).toBeGreaterThan(0);
      expect(budget.tier2).toBeGreaterThan(0);
      expect(budget.tier3).toBeGreaterThan(0);
    });

    it('combat — tier0/tier1이 높고 tier3이 낮음', () => {
      const budget = allocator.allocate('combat');
      expect(budget.tier0).toBe(25000);
      expect(budget.tier1).toBe(30000);
      expect(budget.tier3).toBe(5000);
      expect(budget.total).toBe(75000);
    });

    it('exploration — 균형 잡힌 예산', () => {
      const budget = allocator.allocate('exploration');
      expect(budget.tier0).toBe(20000);
      expect(budget.tier1).toBe(35000);
      expect(budget.tier3).toBe(10000);
      expect(budget.total).toBe(80000);
    });

    it('roleplay — tier1이 가장 큼', () => {
      const budget = allocator.allocate('roleplay');
      expect(budget.tier1).toBe(40000);
      expect(budget.tier1).toBeGreaterThan(budget.tier0);
      expect(budget.total).toBe(80000);
    });

    it('skill_check — tier0/tier1이 높고 tier2/3이 낮음', () => {
      const budget = allocator.allocate('skill_check');
      expect(budget.tier0).toBe(25000);
      expect(budget.tier1).toBe(25000);
      expect(budget.tier2).toBe(10000);
      expect(budget.tier3).toBe(5000);
      expect(budget.total).toBe(65000);
    });
  });

  describe('estimateTokens', () => {
    it('한글 텍스트 토큰 추정', () => {
      const text = '안녕하세요'; // 5자 → ceil(5/3) = 2
      expect(allocator.estimateTokens(text)).toBe(2);
    });

    it('영문 텍스트 토큰 추정', () => {
      const text = 'Hello World'; // 11자 → ceil(11/3) = 4
      expect(allocator.estimateTokens(text)).toBe(4);
    });

    it('빈 문자열 → 0', () => {
      expect(allocator.estimateTokens('')).toBe(0);
    });

    it('긴 텍스트 추정', () => {
      const text = 'a'.repeat(3000); // 3000자 → 1000
      expect(allocator.estimateTokens(text)).toBe(1000);
    });
  });
});
