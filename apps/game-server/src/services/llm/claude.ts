/**
 * Claude (Anthropic) LLM 프로바이더 구현
 *
 * Anthropic SDK를 사용하여 Claude 모델과 통신.
 */
import Anthropic from '@anthropic-ai/sdk';
import type {
  LLMProvider,
  LLMProviderId,
  LLMRequest,
  LLMResponse,
  LLMStreamChunk,
  LLMToolResponse,
} from './provider';

/** 기본 Claude 모델 */
const DEFAULT_MODEL = 'claude-sonnet-4-20250514';

export class ClaudeProvider implements LLMProvider {
  readonly providerId: LLMProviderId = 'claude';
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async generateText(request: LLMRequest): Promise<LLMResponse> {
    const messages = this.convertMessages(request);
    const systemPrompt = this.extractSystemPrompt(request);

    const response = await this.client.messages.create({
      model: request.model ?? DEFAULT_MODEL,
      max_tokens: request.maxTokens ?? 4096,
      temperature: request.temperature ?? 0.7,
      system: systemPrompt,
      messages,
    });

    const textContent = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    return {
      content: textContent,
      model: response.model,
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      },
      finishReason: response.stop_reason ?? 'unknown',
    };
  }

  async *generateStream(request: LLMRequest): AsyncGenerator<LLMStreamChunk> {
    const messages = this.convertMessages(request);
    const systemPrompt = this.extractSystemPrompt(request);

    const stream = this.client.messages.stream({
      model: request.model ?? DEFAULT_MODEL,
      max_tokens: request.maxTokens ?? 4096,
      temperature: request.temperature ?? 0.7,
      system: systemPrompt,
      messages,
    });

    for await (const event of stream) {
      if (
        event.type === 'content_block_delta' &&
        event.delta.type === 'text_delta'
      ) {
        yield { content: event.delta.text, done: false };
      }
    }

    const finalMessage = await stream.finalMessage();
    yield {
      content: '',
      done: true,
      usage: {
        promptTokens: finalMessage.usage.input_tokens,
        completionTokens: finalMessage.usage.output_tokens,
        totalTokens:
          finalMessage.usage.input_tokens + finalMessage.usage.output_tokens,
      },
    };
  }

  async generateWithTools(request: LLMRequest): Promise<LLMToolResponse> {
    const messages = this.convertMessages(request);
    const systemPrompt = this.extractSystemPrompt(request);

    // Anthropic tool 형식으로 변환
    const tools: Anthropic.Tool[] = (request.tools ?? []).map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters as Anthropic.Tool.InputSchema,
    }));

    const response = await this.client.messages.create({
      model: request.model ?? DEFAULT_MODEL,
      max_tokens: request.maxTokens ?? 4096,
      temperature: request.temperature ?? 0.7,
      system: systemPrompt,
      messages,
      tools,
      tool_choice: request.toolChoice === 'required' ? { type: 'any' as const } : undefined,
    });

    const textContent = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    const toolCalls = response.content
      .filter(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
      )
      .map((block) => ({
        id: block.id,
        name: block.name,
        arguments: block.input as Record<string, unknown>,
      }));

    return {
      content: textContent,
      toolCalls,
      model: response.model,
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      },
      finishReason: response.stop_reason ?? 'unknown',
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
      const tempClient = new Anthropic({ apiKey });
      await tempClient.models.list();
      return true;
    } catch {
      return false;
    }
  }

  /** 요청 메시지를 Anthropic 형식으로 변환 (system 역할 제외) */
  private convertMessages(
    request: LLMRequest,
  ): Anthropic.MessageCreateParams['messages'] {
    return request.messages
      .filter((msg) => msg.role !== 'system')
      .map((msg) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      }));
  }

  /** system 역할 메시지와 systemPrompt를 합산하여 단일 시스템 프롬프트 생성 */
  private extractSystemPrompt(request: LLMRequest): string {
    const systemMessages = request.messages
      .filter((msg) => msg.role === 'system')
      .map((msg) => msg.content);

    if (request.systemPrompt) {
      systemMessages.unshift(request.systemPrompt);
    }

    return systemMessages.join('\n\n');
  }
}
