// 하이브리드 카테고리 분류기 — 키워드 매칭 우선, LLM 폴백
import type { LLMRouter } from '../llm/router';
import type { ClassificationResult, RulebookCategory } from './types';
import { CATEGORY_KEYWORDS, escapeRegex } from './category-keywords';

/** 분류기 설정 */
interface ClassifierConfig {
  /** 키워드 매칭 신뢰도 임계값 (이 점수 미만이면 LLM 폴백) */
  confidenceThreshold: number;
  /** LLM 폴백 사용 여부 */
  useLLMFallback: boolean;
  /** LLM 폴백 배치 크기 */
  batchSize: number;
}

const DEFAULT_CONFIG: ClassifierConfig = {
  confidenceThreshold: 3,
  useLLMFallback: true,
  batchSize: 20,
};

/** 카테고리 목록 (LLM 프롬프트용) */
const ALL_CATEGORIES: RulebookCategory[] = [
  'COMBAT', 'MAGIC', 'SKILLS', 'EQUIPMENT', 'MONSTERS', 'CHARACTER', 'GENERAL',
];

export class CategoryClassifier {
  private llmRouter: LLMRouter;
  private config: ClassifierConfig;

  constructor(llmRouter: LLMRouter, config: Partial<ClassifierConfig> = {}) {
    this.llmRouter = llmRouter;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** 단일 청크 카테고리 분류 */
  async classify(content: string): Promise<ClassificationResult> {
    const keywordResult = this.classifyByKeywords(content);

    // 신뢰도 충분하면 키워드 결과 반환
    if (keywordResult.score >= this.config.confidenceThreshold) {
      return {
        category: keywordResult.category,
        confidence: Math.min(1, keywordResult.score / 10),
        method: 'keyword',
      };
    }

    // LLM 폴백 비활성화 시 키워드 결과 그대로 반환
    if (!this.config.useLLMFallback) {
      return {
        category: keywordResult.category,
        confidence: Math.min(1, keywordResult.score / 10),
        method: 'keyword',
      };
    }

    // LLM 폴백
    try {
      const [llmResult] = await this.classifyByLLM([content]);
      return { ...llmResult, method: 'llm' };
    } catch (error) {
      // LLM 실패 시 키워드 결과 폴백
      console.error('[CategoryClassifier] LLM 분류 실패, 키워드 결과 사용:', error);
      return {
        category: keywordResult.category,
        confidence: Math.min(1, keywordResult.score / 10),
        method: 'keyword',
      };
    }
  }

  /** 배치 분류 (청킹 파이프라인에서 사용) */
  async classifyBatch(contents: string[]): Promise<ClassificationResult[]> {
    const results: ClassificationResult[] = [];
    const llmNeeded: Array<{ index: number; content: string }> = [];

    // 1차: 키워드 매칭
    for (let i = 0; i < contents.length; i++) {
      const keywordResult = this.classifyByKeywords(contents[i]);

      if (keywordResult.score >= this.config.confidenceThreshold) {
        results[i] = {
          category: keywordResult.category,
          confidence: Math.min(1, keywordResult.score / 10),
          method: 'keyword',
        };
      } else {
        // LLM 폴백 대기열에 추가
        llmNeeded.push({ index: i, content: contents[i] });
        // 임시로 키워드 결과 저장 (LLM 실패 시 폴백)
        results[i] = {
          category: keywordResult.category,
          confidence: Math.min(1, keywordResult.score / 10),
          method: 'keyword',
        };
      }
    }

    // 2차: LLM 폴백 (필요한 것만 배치 처리)
    if (this.config.useLLMFallback && llmNeeded.length > 0) {
      for (let i = 0; i < llmNeeded.length; i += this.config.batchSize) {
        const batch = llmNeeded.slice(i, i + this.config.batchSize);
        try {
          const llmResults = await this.classifyByLLM(batch.map((b) => b.content));
          for (let j = 0; j < batch.length; j++) {
            results[batch[j].index] = { ...llmResults[j], method: 'llm' };
          }
        } catch (error) {
          console.error('[CategoryClassifier] 배치 LLM 분류 실패:', error);
          // 키워드 결과 유지 (이미 할당됨)
        }
      }
    }

    return results;
  }

  /** 키워드 기반 분류 (기존 chunker.classifyCategory 로직) */
  private classifyByKeywords(content: string): {
    category: RulebookCategory;
    score: number;
  } {
    const lower = content.toLowerCase();
    const scores: Record<RulebookCategory, number> = {
      COMBAT: 0,
      MAGIC: 0,
      SKILLS: 0,
      EQUIPMENT: 0,
      MONSTERS: 0,
      CHARACTER: 0,
      GENERAL: 0,
    };

    for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
      for (const keyword of keywords) {
        const regex = new RegExp(`\\b${escapeRegex(keyword)}\\b`, 'gi');
        const matches = lower.match(regex);
        if (matches) {
          scores[category as RulebookCategory] += matches.length;
        }
      }
    }

    let best: RulebookCategory = 'GENERAL';
    let bestScore = 0;
    for (const [category, score] of Object.entries(scores)) {
      if (score > bestScore) {
        bestScore = score;
        best = category as RulebookCategory;
      }
    }

    return { category: best, score: bestScore };
  }

  /** LLM 기반 분류 (폴백) */
  private async classifyByLLM(
    contents: string[],
  ): Promise<Array<{ category: RulebookCategory; confidence: number }>> {
    const chunks = contents
      .map((c, i) => `[${i + 1}] ${c.slice(0, 200)}`)
      .join('\n\n');

    const prompt = `다음 TRPG 규칙서 청크들의 카테고리를 분류하세요.
가능한 카테고리: ${ALL_CATEGORIES.join(', ')}

${chunks}

JSON 배열로만 응답하세요:
[{"id":"1","category":"COMBAT","confidence":0.9}]`;

    const { provider, model } = this.llmRouter.getProvider('rerank');
    const response = await provider.generateText({
      messages: [{ role: 'user', content: prompt }],
      model,
      temperature: 0,
      maxTokens: 256,
    });

    try {
      const jsonMatch = response.content.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        throw new Error('JSON 배열을 찾을 수 없습니다');
      }

      const parsed: Array<{ category: string; confidence: number }> = JSON.parse(jsonMatch[0]);

      return parsed.map((entry) => ({
        category: ALL_CATEGORIES.includes(entry.category as RulebookCategory)
          ? (entry.category as RulebookCategory)
          : 'GENERAL',
        confidence: Math.max(0, Math.min(1, entry.confidence)),
      }));
    } catch {
      // 파싱 실패 시 GENERAL 폴백
      return contents.map(() => ({ category: 'GENERAL' as RulebookCategory, confidence: 0.1 }));
    }
  }
}
