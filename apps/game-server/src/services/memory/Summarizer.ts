// 요약기 — LLM을 사용하여 장면/세션 요약 생성
// Tier 2 (장면 요약), Tier 3 (세션 요약) 데이터 생성 담당

import type { SummarizeResult } from './types';

// LLM 호출 인터페이스 (최소한의 의존성)
export interface SummarizerLLM {
  generateText(request: {
    messages: Array<{ role: string; content: string }>;
    model?: string;
    maxTokens?: number;
    temperature?: number;
  }): Promise<{ content: string }>;
}

// 장면 요약 시스템 프롬프트
const SCENE_SUMMARIZE_PROMPT = `당신은 TRPG 게임 세션 기록을 요약하는 보조입니다.

다음 대화 내용을 간결하게 요약하세요:
1. 핵심 사건과 결과를 중심으로 요약
2. 중요한 NPC 이름, 장소, 아이템을 보존
3. 주사위 판정 결과를 포함

다음 JSON 형식으로 응답하세요:
{
  "summary": "요약 텍스트 (200자 이내)",
  "keyEvents": ["핵심 사건 1", "핵심 사건 2", ...]
}`;

// 세션 요약 시스템 프롬프트
const SESSION_SUMMARIZE_PROMPT = `당신은 TRPG 게임 세션 전체를 요약하는 보조입니다.

여러 장면 요약을 받아 세션 전체 요약을 생성하세요:
1. 200-400 단어로 요약
2. 전체적인 스토리 흐름을 파악할 수 있게
3. 주요 성과, 획득 아이템, NPC 관계 변화 포함

다음 JSON 형식으로 응답하세요:
{
  "summary": "세션 전체 요약",
  "keyEvents": ["주요 사건 1", "주요 사건 2", ...]
}`;

export class Summarizer {
  constructor(
    private llmProvider: SummarizerLLM,
    private model: string,
  ) {}

  // 장면 요약 생성 (Tier 2 데이터)
  async summarizeScene(
    messages: Array<{ role: string; content: string }>,
    context?: string,
  ): Promise<SummarizeResult> {
    const conversationText = messages
      .map((m) => `${m.role}: ${m.content}`)
      .join('\n');

    const contextSection = context ? `\n\n배경 정보:\n${context}` : '';

    const response = await this.llmProvider.generateText({
      messages: [
        { role: 'system', content: SCENE_SUMMARIZE_PROMPT },
        { role: 'user', content: `${conversationText}${contextSection}` },
      ],
      model: this.model,
      maxTokens: 500,
      temperature: 0.3,
    });

    return this.parseResponse(response.content);
  }

  // 세션 요약 생성 (Tier 3 데이터)
  async summarizeSession(sceneSummaries: string[]): Promise<SummarizeResult> {
    const summariesText = sceneSummaries
      .map((s, i) => `장면 ${i + 1}: ${s}`)
      .join('\n\n');

    const response = await this.llmProvider.generateText({
      messages: [
        { role: 'system', content: SESSION_SUMMARIZE_PROMPT },
        { role: 'user', content: summariesText },
      ],
      model: this.model,
      maxTokens: 800,
      temperature: 0.3,
    });

    return this.parseResponse(response.content);
  }

  // LLM 응답 파싱 (JSON 또는 폴백)
  private parseResponse(content: string): SummarizeResult {
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return this.fallbackResult(content);
      }

      const parsed = JSON.parse(jsonMatch[0]);

      if (typeof parsed.summary !== 'string') {
        return this.fallbackResult(content);
      }

      const keyEvents = Array.isArray(parsed.keyEvents)
        ? parsed.keyEvents.filter((e: unknown) => typeof e === 'string')
        : [];

      return {
        summary: parsed.summary,
        keyEvents,
        tokenCount: Math.ceil(parsed.summary.length / 3),
      };
    } catch {
      return this.fallbackResult(content);
    }
  }

  // JSON 파싱 실패 시 폴백
  private fallbackResult(content: string): SummarizeResult {
    return {
      summary: content.trim(),
      keyEvents: [],
      tokenCount: Math.ceil(content.length / 3),
    };
  }
}
