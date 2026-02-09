// GM 개입 판단 오케스트레이터
// 1단계 규칙 필터 → 2단계 LLM 분류기 → aggressiveness 보정

import type { InterventionRules } from './InterventionRules';
import type { InterventionClassifier } from './InterventionClassifier';
import type {
  InterventionInput,
  InterventionDecision,
  InterventionUrgency,
} from './types';

// urgency 수준 순서 (상향/하향 보정용)
const URGENCY_LEVELS: InterventionUrgency[] = ['none', 'background', 'after_rp', 'immediate'];

export class InterventionManager {
  constructor(
    private rules: InterventionRules,
    private classifier: InterventionClassifier,
  ) {}

  // 개입 판단 실행
  async evaluate(input: InterventionInput): Promise<InterventionDecision> {
    // 1단계: 규칙 기반 사전 필터
    const ruleResult = this.rules.evaluate(input);

    // bypass → 즉시 개입
    if (ruleResult.result === 'bypass' && ruleResult.decision) {
      return ruleResult.decision;
    }

    // pass → 즉시 무시
    if (ruleResult.result === 'pass' && ruleResult.decision) {
      return ruleResult.decision;
    }

    // 2단계: LLM 분류기
    const decision = await this.classifier.classify(input);

    // aggressiveness에 따른 urgency 보정
    return this.adjustUrgency(decision, input.aggressiveness);
  }

  // aggressiveness에 따른 urgency 보정
  private adjustUrgency(
    decision: InterventionDecision,
    aggressiveness: InterventionInput['aggressiveness'],
  ): InterventionDecision {
    if (aggressiveness === 'balanced') {
      return decision;
    }

    const currentIndex = URGENCY_LEVELS.indexOf(decision.urgency);

    if (aggressiveness === 'passive') {
      // 하향 보정: background → none, after_rp → background
      const newIndex = Math.max(0, currentIndex - 1);
      const newUrgency = URGENCY_LEVELS[newIndex];
      return {
        ...decision,
        urgency: newUrgency,
        // none으로 내려가면 개입하지 않음
        shouldIntervene: newUrgency !== 'none' ? decision.shouldIntervene : false,
      };
    }

    if (aggressiveness === 'active') {
      // 상향 보정: background → after_rp, after_rp → immediate
      const newIndex = Math.min(URGENCY_LEVELS.length - 1, currentIndex + 1);
      return {
        ...decision,
        urgency: URGENCY_LEVELS[newIndex],
      };
    }

    return decision;
  }
}
