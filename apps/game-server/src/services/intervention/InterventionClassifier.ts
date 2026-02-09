// 2단계: LLM 분류기
// 규칙 필터를 통과한 메시지에 대해 LLM으로 개입 여부를 판단

import type { LLMProvider, LLMRequest } from '../llm/provider';
import type { InterventionInput, InterventionDecision } from './types';

// JSON 파싱 실패 시 기본값
const DEFAULT_DECISION: InterventionDecision = {
  shouldIntervene: true,
  reason: 'LLM 분류 결과 파싱 실패 — 안전하게 개입',
  urgency: 'background',
  interventionType: 'narration',
};

export class InterventionClassifier {
  constructor(
    private provider: LLMProvider,
    private model: string,
  ) {}

  // LLM으로 개입 여부 분류
  async classify(input: InterventionInput): Promise<InterventionDecision> {
    const prompt = this.buildPrompt(input);

    const request: LLMRequest = {
      messages: [
        {
          role: 'system',
          content:
            '당신은 TRPG 게임 마스터 보조입니다. 플레이어 메시지를 분석하여 GM 개입이 필요한지 판단합니다. 반드시 JSON 형식으로만 응답하세요.',
        },
        { role: 'user', content: prompt },
      ],
      model: this.model,
      maxTokens: 200,
      temperature: 0.1,
    };

    try {
      const response = await this.provider.generateText(request);
      return this.parseResponse(response.content);
    } catch {
      // LLM 호출 실패 시 기본값 반환
      return { ...DEFAULT_DECISION, reason: 'LLM 호출 실패 — 안전하게 개입' };
    }
  }

  // LLM 프롬프트 생성
  private buildPrompt(input: InterventionInput): string {
    const contextInfo = input.recentMessages
      ? `\n최근 대화:\n${input.recentMessages.map((m) => `${m.role}: ${m.content}`).join('\n')}`
      : '';

    return `다음 플레이어 메시지에 대해 GM이 개입해야 하는지 판단하세요.

메시지: "${input.message}"${contextInfo}

JSON으로 응답하세요:
{ "shouldIntervene": boolean, "reason": "이유", "urgency": "immediate|after_rp|background|none", "interventionType": "narration|npc_response|rule_check|environment|story_advance" }`;
  }

  // LLM 응답 JSON 파싱
  private parseResponse(content: string): InterventionDecision {
    try {
      // JSON 블록 추출 (```json ... ``` 또는 { ... } 형태)
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return { ...DEFAULT_DECISION };
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // 필수 필드 검증
      if (
        typeof parsed.shouldIntervene !== 'boolean' ||
        typeof parsed.reason !== 'string' ||
        !['immediate', 'after_rp', 'background', 'none'].includes(parsed.urgency) ||
        !['narration', 'npc_response', 'rule_check', 'environment', 'story_advance'].includes(
          parsed.interventionType,
        )
      ) {
        return { ...DEFAULT_DECISION };
      }

      return {
        shouldIntervene: parsed.shouldIntervene,
        reason: parsed.reason,
        urgency: parsed.urgency,
        interventionType: parsed.interventionType,
      };
    } catch {
      return { ...DEFAULT_DECISION };
    }
  }
}
