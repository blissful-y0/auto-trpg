import { describe, it, expect, vi } from 'vitest';
import { InterventionClassifier } from '../InterventionClassifier';
import type { LLMProvider, LLMResponse } from '../../llm/provider';
import type { InterventionInput } from '../types';

// LLM 프로바이더 모킹
function createMockProvider(responseContent: string): LLMProvider {
  return {
    providerId: 'claude',
    generateText: vi.fn().mockResolvedValue({
      content: responseContent,
      model: 'claude-haiku-3-5-20241022',
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      finishReason: 'end_turn',
    } satisfies LLMResponse),
    generateStream: vi.fn(),
    generateWithTools: vi.fn(),
    countTokens: vi.fn().mockReturnValue(10),
    validateKey: vi.fn().mockResolvedValue(true),
  } as unknown as LLMProvider;
}

describe('InterventionClassifier', () => {
  const baseInput: InterventionInput = {
    sessionId: 'session-1',
    characterId: 'char-1',
    userId: 'user-1',
    message: '문을 열고 안을 들여다본다',
    isOOC: false,
    aggressiveness: 'balanced',
  };

  it('정상 JSON 응답 파싱', async () => {
    const mockResponse = JSON.stringify({
      shouldIntervene: true,
      reason: '환경 묘사가 필요한 행동',
      urgency: 'immediate',
      interventionType: 'narration',
    });

    const provider = createMockProvider(mockResponse);
    const classifier = new InterventionClassifier(provider, 'claude-haiku-3-5-20241022');

    const decision = await classifier.classify(baseInput);

    expect(decision.shouldIntervene).toBe(true);
    expect(decision.reason).toBe('환경 묘사가 필요한 행동');
    expect(decision.urgency).toBe('immediate');
    expect(decision.interventionType).toBe('narration');
    expect(provider.generateText).toHaveBeenCalledOnce();
  });

  it('```json 블록 포함 응답 파싱', async () => {
    const mockResponse = '```json\n' + JSON.stringify({
      shouldIntervene: false,
      reason: '단순 이동',
      urgency: 'none',
      interventionType: 'narration',
    }) + '\n```';

    const provider = createMockProvider(mockResponse);
    const classifier = new InterventionClassifier(provider, 'claude-haiku-3-5-20241022');

    const decision = await classifier.classify(baseInput);

    expect(decision.shouldIntervene).toBe(false);
    expect(decision.urgency).toBe('none');
  });

  it('잘못된 JSON → 기본값 반환', async () => {
    const provider = createMockProvider('이건 JSON이 아닙니다');
    const classifier = new InterventionClassifier(provider, 'claude-haiku-3-5-20241022');

    const decision = await classifier.classify(baseInput);

    // 기본값: shouldIntervene=true, urgency=background, interventionType=narration
    expect(decision.shouldIntervene).toBe(true);
    expect(decision.urgency).toBe('background');
    expect(decision.interventionType).toBe('narration');
  });

  it('유효하지 않은 urgency 값 → 기본값 반환', async () => {
    const mockResponse = JSON.stringify({
      shouldIntervene: true,
      reason: '테스트',
      urgency: 'invalid_urgency',
      interventionType: 'narration',
    });

    const provider = createMockProvider(mockResponse);
    const classifier = new InterventionClassifier(provider, 'claude-haiku-3-5-20241022');

    const decision = await classifier.classify(baseInput);

    expect(decision.shouldIntervene).toBe(true);
    expect(decision.urgency).toBe('background'); // 기본값
  });

  it('LLM 호출 실패 → 기본값 반환', async () => {
    const provider = createMockProvider('');
    (provider.generateText as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('API 오류'));
    const classifier = new InterventionClassifier(provider, 'claude-haiku-3-5-20241022');

    const decision = await classifier.classify(baseInput);

    expect(decision.shouldIntervene).toBe(true);
    expect(decision.urgency).toBe('background');
    expect(decision.reason).toContain('LLM 호출 실패');
  });

  it('recentMessages 포함 시 프롬프트에 반영', async () => {
    const mockResponse = JSON.stringify({
      shouldIntervene: true,
      reason: '대화 맥락 분석',
      urgency: 'after_rp',
      interventionType: 'story_advance',
    });

    const provider = createMockProvider(mockResponse);
    const classifier = new InterventionClassifier(provider, 'claude-haiku-3-5-20241022');

    const inputWithContext = {
      ...baseInput,
      recentMessages: [
        { role: 'user', content: '마을에 도착했다' },
        { role: 'assistant', content: '마을 입구가 보입니다' },
      ],
    };

    const decision = await classifier.classify(inputWithContext);

    expect(decision.interventionType).toBe('story_advance');
    // generateText가 호출되었는지 확인
    const callArgs = (provider.generateText as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArgs.messages[1].content).toContain('최근 대화');
  });
});
