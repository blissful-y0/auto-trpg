import { describe, it, expect, vi } from 'vitest';
import { Summarizer } from '../Summarizer';
import type { SummarizerLLM } from '../Summarizer';

// LLM 모킹
function createMockLLM(responseContent: string): SummarizerLLM {
  return {
    generateText: vi.fn().mockResolvedValue({ content: responseContent }),
  };
}

describe('Summarizer', () => {
  const testMessages = [
    { role: 'user', content: '고블린을 공격한다' },
    { role: 'assistant', content: '당신의 검이 고블린을 관통합니다. 10 피해!' },
    { role: 'user', content: '주변을 살펴본다' },
    { role: 'assistant', content: '고블린이 쓰러진 자리에 열쇠가 보입니다.' },
  ];

  describe('summarizeScene', () => {
    it('정상 JSON 응답 파싱', async () => {
      const mockResponse = JSON.stringify({
        summary: '모험자가 고블린을 처치하고 열쇠를 발견했다.',
        keyEvents: ['고블린 처치', '열쇠 발견'],
      });
      const llm = createMockLLM(mockResponse);
      const summarizer = new Summarizer(llm, 'test-model');

      const result = await summarizer.summarizeScene(testMessages);

      expect(result.summary).toBe('모험자가 고블린을 처치하고 열쇠를 발견했다.');
      expect(result.keyEvents).toEqual(['고블린 처치', '열쇠 발견']);
      expect(result.tokenCount).toBeGreaterThan(0);
      expect(llm.generateText).toHaveBeenCalledOnce();
    });

    it('컨텍스트 포함 시 프롬프트에 반영', async () => {
      const mockResponse = JSON.stringify({
        summary: '요약 텍스트',
        keyEvents: [],
      });
      const llm = createMockLLM(mockResponse);
      const summarizer = new Summarizer(llm, 'test-model');

      await summarizer.summarizeScene(testMessages, '이전 장면: 던전 입구');

      const callArgs = (llm.generateText as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(callArgs.messages[1].content).toContain('이전 장면: 던전 입구');
    });

    it('JSON 파싱 실패 시 폴백', async () => {
      const llm = createMockLLM('이것은 JSON이 아닌 일반 텍스트 요약입니다.');
      const summarizer = new Summarizer(llm, 'test-model');

      const result = await summarizer.summarizeScene(testMessages);

      expect(result.summary).toBe('이것은 JSON이 아닌 일반 텍스트 요약입니다.');
      expect(result.keyEvents).toEqual([]);
      expect(result.tokenCount).toBeGreaterThan(0);
    });
  });

  describe('summarizeSession', () => {
    it('여러 장면 요약을 세션 요약으로', async () => {
      const mockResponse = JSON.stringify({
        summary: '세션 전체: 모험자들이 던전을 탐험하고 보스를 처치했다.',
        keyEvents: ['던전 진입', '함정 해제', '보스 처치'],
      });
      const llm = createMockLLM(mockResponse);
      const summarizer = new Summarizer(llm, 'test-model');

      const sceneSummaries = [
        '던전에 진입하여 함정을 발견했다.',
        '함정을 해제하고 보물 방에 도착했다.',
        '보스 고블린 왕을 처치했다.',
      ];

      const result = await summarizer.summarizeSession(sceneSummaries);

      expect(result.summary).toContain('던전');
      expect(result.keyEvents).toHaveLength(3);
      // 프롬프트에 장면 번호가 포함되어야 함
      const callArgs = (llm.generateText as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(callArgs.messages[1].content).toContain('장면 1');
      expect(callArgs.messages[1].content).toContain('장면 3');
    });

    it('빈 keyEvents 처리', async () => {
      const mockResponse = JSON.stringify({
        summary: '짧은 세션이었다.',
      });
      const llm = createMockLLM(mockResponse);
      const summarizer = new Summarizer(llm, 'test-model');

      const result = await summarizer.summarizeSession(['짧은 장면']);

      expect(result.summary).toBe('짧은 세션이었다.');
      expect(result.keyEvents).toEqual([]);
    });
  });
});
