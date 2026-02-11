/**
 * OpenAI LLM 프로바이더 구현
 *
 * OpenAI SDK를 사용하여 GPT 모델과 통신.
 */
import OpenAI from 'openai';
import type {
  LLMProvider,
  LLMProviderId,
  LLMRequest,
  LLMResponse,
  LLMStreamChunk,
  LLMToolResponse,
} from './provider';

/** 기본 OpenAI 모델 */
const DEFAULT_MODEL = 'gpt-4o';

export class OpenAIProvider implements LLMProvider {
  readonly providerId: LLMProviderId = 'openai';
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async generateText(request: LLMRequest): Promise<LLMResponse> {
    const messages = this.convertMessages(request);

    const response = await this.client.chat.completions.create({
      model: request.model ?? DEFAULT_MODEL,
      max_tokens: request.maxTokens ?? 4096,
      temperature: request.temperature ?? 0.7,
      messages,
    });

    const choice = response.choices[0];

    return {
      content: choice?.message?.content ?? '',
      model: response.model,
      usage: {
        promptTokens: response.usage?.prompt_tokens ?? 0,
        completionTokens: response.usage?.completion_tokens ?? 0,
        totalTokens: response.usage?.total_tokens ?? 0,
      },
      finishReason: choice?.finish_reason ?? 'unknown',
    };
  }

  async *generateStream(request: LLMRequest): AsyncGenerator<LLMStreamChunk> {
    const messages = this.convertMessages(request);

    const stream = await this.client.chat.completions.create({
      model: request.model ?? DEFAULT_MODEL,
      max_tokens: request.maxTokens ?? 4096,
      temperature: request.temperature ?? 0.7,
      messages,
      stream: true,
      stream_options: { include_usage: true },
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      const content = delta?.content ?? '';

      if (content) {
        yield { content, done: false };
      }

      // 마지막 청크에 usage 정보 포함
      if (chunk.usage) {
        yield {
          content: '',
          done: true,
          usage: {
            promptTokens: chunk.usage.prompt_tokens,
            completionTokens: chunk.usage.completion_tokens,
            totalTokens: chunk.usage.total_tokens,
          },
        };
      }
    }
  }

  async generateWithTools(request: LLMRequest): Promise<LLMToolResponse> {
    const messages = this.convertMessages(request);

    // OpenAI function calling 형식으로 변환
    const tools: OpenAI.ChatCompletionTool[] = (request.tools ?? []).map(
      (tool) => ({
        type: 'function' as const,
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        },
      }),
    );

    const response = await this.client.chat.completions.create({
      model: request.model ?? DEFAULT_MODEL,
      max_tokens: request.maxTokens ?? 4096,
      temperature: request.temperature ?? 0.7,
      messages,
      tools: tools.length > 0 ? tools : undefined,
      tool_choice: tools.length > 0 && request.toolChoice === 'required' ? 'required' : undefined,
    });

    const choice = response.choices[0];
    const toolCalls = (choice?.message?.tool_calls ?? []).map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      arguments: JSON.parse(tc.function.arguments) as Record<string, unknown>,
    }));

    return {
      content: choice?.message?.content ?? '',
      toolCalls,
      model: response.model,
      usage: {
        promptTokens: response.usage?.prompt_tokens ?? 0,
        completionTokens: response.usage?.completion_tokens ?? 0,
        totalTokens: response.usage?.total_tokens ?? 0,
      },
      finishReason: choice?.finish_reason ?? 'unknown',
    };
  }


  async generateEmbedding(text: string, model?: string): Promise<{ embedding: number[]; usage: { promptTokens: number; completionTokens: number; totalTokens: number } }> {
    const response = await this.client.embeddings.create({
      model: model ?? 'text-embedding-3-small',
      input: text,
    });

    return {
      embedding: response.data[0].embedding,
      usage: {
        promptTokens: response.usage.prompt_tokens,
        completionTokens: 0,
        totalTokens: response.usage.total_tokens,
      },
    };
  }

  countTokens(text: string): number {
    // 영어 단어수 × 1.3 + 한국어 글자수 × 0.5 근사치
    const koreanChars = (text.match(/[\uAC00-\uD7AF]/g) ?? []).length;
    const nonKorean = text.replace(/[\uAC00-\uD7AF]/g, '');
    const englishWords = nonKorean
      .split(/\s+/)
      .filter((w) => w.length > 0).length;
    return Math.ceil(englishWords * 1.3 + koreanChars * 0.5);
  }

  async validateKey(apiKey: string): Promise<boolean> {
    try {
      const tempClient = new OpenAI({ apiKey });
      await tempClient.models.list();
      return true;
    } catch {
      return false;
    }
  }

  /** 요청 메시지를 OpenAI 형식으로 변환 */
  private convertMessages(
    request: LLMRequest,
  ): OpenAI.ChatCompletionMessageParam[] {
    const messages: OpenAI.ChatCompletionMessageParam[] = [];

    // systemPrompt가 별도로 있으면 맨 앞에 추가
    if (request.systemPrompt) {
      messages.push({ role: 'system', content: request.systemPrompt });
    }

    for (const msg of request.messages) {
      messages.push({
        role: msg.role,
        content: msg.content,
      });
    }

    return messages;
  }
}
