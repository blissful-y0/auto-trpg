/**
 * LLM 라우터 — 작업 유형에 따라 적절한 프로바이더 + 모델 선택
 *
 * 사용자가 등록한 프로바이더 기반으로 최적의 모델을 자동 라우팅.
 */
import type { LLMProvider, LLMProviderId, ModelRouting, TaskType } from './provider';
import { ClaudeProvider } from './claude';
import { OpenAIProvider } from './openai';
import { GeminiProvider } from './gemini';

interface ProviderSelectionOptions {
  userProviders?: LLMProviderId[];
  preferredProvider?: LLMProviderId;
  preferredModel?: string;
}

/** 작업별 기본 라우팅 설정 (우선순위 낮을수록 우선) */
const DEFAULT_ROUTING: Record<TaskType, ModelRouting[]> = {
  gm_response: [
    { providerId: 'claude', model: 'claude-sonnet-4-20250514', priority: 1 },
    { providerId: 'openai', model: 'gpt-4o', priority: 2 },
    { providerId: 'gemini', model: 'gemini-2.0-flash', priority: 3 },
  ],
  intervention_check: [
    { providerId: 'claude', model: 'claude-haiku-3-5-20241022', priority: 1 },
    { providerId: 'gemini', model: 'gemini-2.0-flash', priority: 2 },
    { providerId: 'openai', model: 'gpt-4o-mini', priority: 3 },
  ],
  summarize: [
    { providerId: 'openai', model: 'gpt-4o-mini', priority: 1 },
    { providerId: 'gemini', model: 'gemini-2.0-flash', priority: 2 },
    { providerId: 'claude', model: 'claude-haiku-3-5-20241022', priority: 3 },
  ],
  embedding: [{ providerId: 'openai', model: 'text-embedding-3-small', priority: 1 }],
  rerank: [
    { providerId: 'claude', model: 'claude-haiku-3-5-20241022', priority: 1 },
    { providerId: 'gemini', model: 'gemini-2.0-flash', priority: 2 },
    { providerId: 'openai', model: 'gpt-4o-mini', priority: 3 },
  ],
};

/** 프로바이더별 팩토리 */
const PROVIDER_FACTORIES: Record<LLMProviderId, (apiKey: string) => LLMProvider> = {
  claude: (apiKey) => new ClaudeProvider(apiKey),
  openai: (apiKey) => new OpenAIProvider(apiKey),
  gemini: (apiKey) => new GeminiProvider(apiKey),
};

export class LLMRouter {
  /** 프로바이더별 API 키 매핑 */
  private apiKeys: Map<LLMProviderId, string>;

  /** 생성된 프로바이더 인스턴스 캐시 */
  private providers: Map<LLMProviderId, LLMProvider> = new Map();

  /** 커스텀 라우팅 설정 (기본값 덮어쓰기 가능) */
  private routing: Record<TaskType, ModelRouting[]>;

  constructor(
    apiKeys: Map<LLMProviderId, string>,
    customRouting?: Partial<Record<TaskType, ModelRouting[]>>,
  ) {
    this.apiKeys = apiKeys;
    this.routing = { ...DEFAULT_ROUTING, ...customRouting };
  }

  /**
   * 작업 유형에 따라 적절한 프로바이더 반환
   *
   * 사용 가능한 프로바이더 목록에서 우선순위가 가장 높은 프로바이더 선택.
   * 해당 작업에 사용할 수 있는 프로바이더가 없으면 에러 발생.
   */
  getProvider(
    taskType: TaskType,
    userProviders?: LLMProviderId[],
  ): { provider: LLMProvider; model: string } {
    return this.getProviderForTask(taskType, { userProviders });
  }

  getProviderForTask(
    taskType: TaskType,
    options: ProviderSelectionOptions = {},
  ): { provider: LLMProvider; model: string } {
    const availableProviders = options.userProviders ?? [...this.apiKeys.keys()];
    const routingOptions = this.routing[taskType];

    if (!routingOptions || routingOptions.length === 0) {
      throw new Error(`작업 유형 '${taskType}'에 대한 라우팅 설정이 없습니다.`);
    }

    if (options.preferredProvider && availableProviders.includes(options.preferredProvider)) {
      const provider = this.getOrCreateProvider(options.preferredProvider);
      const fallbackModel = this.getDefaultModelForProvider(taskType, options.preferredProvider);
      const model = options.preferredModel || fallbackModel;

      if (model) {
        return { provider, model };
      }
    }

    // 우선순위 정렬 후 사용 가능한 프로바이더 찾기
    const sorted = [...routingOptions].sort((a, b) => a.priority - b.priority);

    for (const option of sorted) {
      if (availableProviders.includes(option.providerId)) {
        const provider = this.getOrCreateProvider(option.providerId);
        return { provider, model: option.model };
      }
    }

    throw new Error(
      `작업 유형 '${taskType}'에 사용 가능한 프로바이더가 없습니다. ` +
        `필요한 프로바이더: ${sorted.map((o) => o.providerId).join(', ')}`,
    );
  }

  private getDefaultModelForProvider(
    taskType: TaskType,
    providerId: LLMProviderId,
  ): string | undefined {
    const options = this.routing[taskType] ?? [];
    const found = options
      .filter((option) => option.providerId === providerId)
      .sort((a, b) => a.priority - b.priority)[0];

    return found?.model;
  }

  /** 특정 프로바이더 직접 가져오기 */
  getProviderById(providerId: LLMProviderId): LLMProvider {
    return this.getOrCreateProvider(providerId);
  }

  /** 등록된 프로바이더 목록 반환 */
  getAvailableProviders(): LLMProviderId[] {
    return [...this.apiKeys.keys()];
  }

  /** 프로바이더 인스턴스 생성 또는 캐시에서 반환 */
  private getOrCreateProvider(providerId: LLMProviderId): LLMProvider {
    const cached = this.providers.get(providerId);
    if (cached) return cached;

    const apiKey = this.apiKeys.get(providerId);
    if (!apiKey) {
      throw new Error(`프로바이더 '${providerId}'의 API 키가 등록되지 않았습니다.`);
    }

    const factory = PROVIDER_FACTORIES[providerId];
    const provider = factory(apiKey);
    this.providers.set(providerId, provider);
    return provider;
  }
}
