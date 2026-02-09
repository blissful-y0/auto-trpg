// 1단계: 규칙 기반 사전 필터
// 메시지 패턴을 분석하여 LLM 호출 없이 빠르게 개입 여부를 판단

import type {
  InterventionInput,
  InterventionDecision,
  RuleFilterResult,
} from './types';

// 규칙 필터 결과 (bypass/pass 시 decision 포함)
export interface RuleEvaluation {
  result: RuleFilterResult;
  decision?: InterventionDecision;
}

// 전투 관련 키워드
const COMBAT_KEYWORDS = [
  '공격', '때리', '때린', '찌르', '찔러', '쏘', '쏜', '쏴',
  '베', '벤', '방어', '회피', '시전', '주문',
  'attack', 'hit', 'strike', 'shoot', 'cast',
];

// 주사위 요청 패턴
const DICE_PATTERNS = [
  /\d*d\d+/i,            // d20, 2d6 등
  /판정/,                 // 판정
  /체크/,                 // 체크
  /굴려/,                 // 굴려
  /roll/i,               // roll
];

// NPC 직접 대화 패턴
const NPC_TALK_PATTERNS = [
  /(.+)에게\s/,           // "NPC에게 말한다"
  /(.+)한테\s/,           // "NPC한테 말한다"
];

// 직접 질문 패턴
const QUESTION_PATTERNS = [
  /\?/,                   // 물음표
  /뭐가/,                 // 뭐가
  /어디에/,               // 어디에
  /어디로/,               // 어디로
  /어떻게/,               // 어떻게
  /무엇/,                 // 무엇
  /왜\s/,                 // 왜
  /어디/,                 // 어디
  /얼마/,                 // 얼마
];

// PC간 대화 패턴 (GM 개입 불필요)
const PC_CONVERSATION_PATTERNS = [
  /^["'].*["']$/,         // 따옴표로만 감싼 대화
  /에게\s*말한다/,         // ~에게 말한다
  /에게\s*["']/,          // ~에게 "대사"
  /한테\s*말한다/,         // ~한테 말한다
  /한테\s*["']/,          // ~한테 "대사"
];

// 이모트/순수 묘사 패턴 (GM 개입 불필요)
const EMOTE_PATTERNS = [
  /^\/me\s/,              // /me 이모트
  /^\*[^*]+\*$/,          // *동작*
  /^~.+~$/,              // ~동작~
];

export class InterventionRules {
  // 메시지 평가 — 규칙 기반 사전 필터
  evaluate(input: InterventionInput): RuleEvaluation {
    const { message, isOOC, combatActive } = input;

    // ── Pass 조건 (즉시 무시) ──

    // OOC 메시지
    if (isOOC || message.trim().startsWith('[OOC]')) {
      return {
        result: 'pass',
        decision: {
          shouldIntervene: false,
          reason: 'OOC 메시지 — GM 개입 불필요',
          urgency: 'none',
          interventionType: 'narration',
        },
      };
    }

    // 이모트/순수 묘사 패턴
    if (EMOTE_PATTERNS.some((p) => p.test(message.trim()))) {
      return {
        result: 'pass',
        decision: {
          shouldIntervene: false,
          reason: '이모트/묘사 — GM 개입 불필요',
          urgency: 'none',
          interventionType: 'narration',
        },
      };
    }

    // PC간 대화 패턴
    if (PC_CONVERSATION_PATTERNS.some((p) => p.test(message.trim()))) {
      return {
        result: 'pass',
        decision: {
          shouldIntervene: false,
          reason: 'PC간 대화 — GM 개입 불필요',
          urgency: 'none',
          interventionType: 'narration',
        },
      };
    }

    // ── Bypass 조건 (즉시 개입) ──

    // @GM 또는 @gm 멘션
    if (/@[Gg][Mm]\b/.test(message)) {
      return {
        result: 'bypass',
        decision: {
          shouldIntervene: true,
          reason: 'GM 멘션 — 즉시 개입',
          urgency: 'immediate',
          interventionType: 'narration',
        },
      };
    }

    // 전투 중 전투 관련 키워드
    if (combatActive && COMBAT_KEYWORDS.some((kw) => message.includes(kw))) {
      return {
        result: 'bypass',
        decision: {
          shouldIntervene: true,
          reason: '전투 중 전투 행동 — 규칙 체크 필요',
          urgency: 'immediate',
          interventionType: 'rule_check',
        },
      };
    }

    // 주사위 요청 패턴
    if (DICE_PATTERNS.some((p) => p.test(message))) {
      return {
        result: 'bypass',
        decision: {
          shouldIntervene: true,
          reason: '주사위 요청 — 규칙 체크 필요',
          urgency: 'immediate',
          interventionType: 'rule_check',
        },
      };
    }

    // NPC 직접 대화 패턴
    if (NPC_TALK_PATTERNS.some((p) => p.test(message))) {
      return {
        result: 'bypass',
        decision: {
          shouldIntervene: true,
          reason: 'NPC 대화 요청 — NPC 응답 필요',
          urgency: 'immediate',
          interventionType: 'npc_response',
        },
      };
    }

    // 직접 질문 패턴
    if (QUESTION_PATTERNS.some((p) => p.test(message))) {
      return {
        result: 'bypass',
        decision: {
          shouldIntervene: true,
          reason: '질문 감지 — 내레이션 필요',
          urgency: 'immediate',
          interventionType: 'narration',
        },
      };
    }

    // ── Classify (2단계 LLM 분류기로) ──
    return { result: 'classify' };
  }
}
