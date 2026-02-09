/**
 * Gemini (Google) LLM 프로바이더 구현
 *
 * Google Generative AI SDK를 사용하여 Gemini 모델과 통신.
 */
import {
  GoogleGenerativeAI,
  type Content,
  type FunctionDeclaration,
  type GenerateContentResult,
  SchemaType,
} from '@google/generative-ai';
import type {
  LLMProvider,
  LLMProviderId,
  LLMRequest,
  LLMResponse,
  LLMStreamChunk,
  LLMToolResponse,
} from './provider';

/** 기본 Gemini 모델 */
const DEFAULT_MODEL = 'gemini-2.0-flash';

export class GeminiProvider implements LLMProvider {
  readonly providerId: LLMProviderId = 'gemini';
  private client: GoogleGenerativeAI;

  constructor(apiKey: string) {
    this.client = new GoogleGenerativeAI(apiKey);
  }

  async generateText(request: LLMRequest): Promise<LLMResponse> {
    const modelName = request.model ?? DEFAULT_MODEL;
    const model = this.client.getGenerativeModel({
      model: modelName,
      systemInstruction: this.extractSystemPrompt(request),
    });

    const contents = this.convertMessages(request);

    const result: GenerateContentResult = await model.generateContent({
      contents,
      generationConfig: {
        maxOutputTokens: request.maxTokens ?? 4096,
        temperature: request.temperature ?? 0.7,
      },
    });

    const response = result.response;
    const text = response.text();
    const usage = response.usageMetadata;

    return {
      content: text,
      model: modelName,
      usage: {
        promptTokens: usage?.promptTokenCount ?? 0,
        completionTokens: usage?.candidatesTokenCount ?? 0,
        totalTokens: usage?.totalTokenCount ?? 0,
      },
      finishReason: response.candidates?.[0]?.finishReason ?? 'unknown',
    };
  }

  async *generateStream(request: LLMRequest): AsyncGenerator<LLMStreamChunk> {
    const modelName = request.model ?? DEFAULT_MODEL;
    const model = this.client.getGenerativeModel({
      model: modelName,
      systemInstruction: this.extractSystemPrompt(request),
    });

    const contents = this.convertMessages(request);

    const result = await model.generateContentStream({
      contents,
      generationConfig: {
        maxOutputTokens: request.maxTokens ?? 4096,
        temperature: request.temperature ?? 0.7,
      },
    });

    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) {
        yield { content: text, done: false };
      }
    }

    // 스트림 완료 후 최종 응답에서 usage 추출
    const finalResponse = await result.response;
    const usage = finalResponse.usageMetadata;

    yield {
      content: '',
      done: true,
      usage: {
        promptTokens: usage?.promptTokenCount ?? 0,
        completionTokens: usage?.candidatesTokenCount ?? 0,
        totalTokens: usage?.totalTokenCount ?? 0,
      },
    };
  }

  async generateWithTools(request: LLMRequest): Promise<LLMToolResponse> {
    const modelName = request.model ?? DEFAULT_MODEL;

    // Gemini function declaration 형식으로 변환
    const functionDeclarations = (request.tools ?? []).map(
      (tool) =>
        ({
          name: tool.name,
          description: tool.description,
          parameters: {
            type: SchemaType.OBJECT,
            properties: (tool.parameters as Record<string, unknown>)
              .properties,
            required: (tool.parameters as Record<string, unknown>)
              .required as string[],
          },
        }) as FunctionDeclaration,
    );

    const model = this.client.getGenerativeModel({
      model: modelName,
      systemInstruction: this.extractSystemPrompt(request),
      tools:
        functionDeclarations.length > 0
          ? [{ functionDeclarations }]
          : undefined,
    });

    const contents = this.convertMessages(request);

    const result = await model.generateContent({
      contents,
      generationConfig: {
        maxOutputTokens: request.maxTokens ?? 4096,
        temperature: request.temperature ?? 0.7,
      },
    });

    const response = result.response;
    const text = response.text();
    const usage = response.usageMetadata;

    // function call 추출
    const toolCalls = (
      response.candidates?.[0]?.content?.parts ?? []
    )
      .filter((part) => part.functionCall != null)
      .map((part, index) => ({
        id: `call_${index}`,
        name: part.functionCall!.name,
        arguments: (part.functionCall!.args ?? {}) as Record<string, unknown>,
      }));

    return {
      content: text,
      toolCalls,
      model: modelName,
      usage: {
        promptTokens: usage?.promptTokenCount ?? 0,
        completionTokens: usage?.candidatesTokenCount ?? 0,
        totalTokens: usage?.totalTokenCount ?? 0,
      },
      finishReason: response.candidates?.[0]?.finishReason ?? 'unknown',
    };
  }

  countTokens(text: string): number {
    // 영어 단어수 × 1.3 + 한국어 글자수 × 0.5 근사치
    // Gemini의 countTokens API는 비동기이므로 근사치 사용
    const koreanChars = (text.match(/[\uAC00-\uD7AF]/g) ?? []).length;
    const nonKorean = text.replace(/[\uAC00-\uD7AF]/g, '');
    const englishWords = nonKorean
      .split(/\s+/)
      .filter((w) => w.length > 0).length;
    return Math.ceil(englishWords * 1.3 + koreanChars * 0.5);
  }

  async validateKey(apiKey: string): Promise<boolean> {
    try {
      const tempClient = new GoogleGenerativeAI(apiKey);
      const model = tempClient.getGenerativeModel({ model: DEFAULT_MODEL });
      // 간단한 API 호출로 키 검증
      await model.generateContent('test');
      return true;
    } catch {
      return false;
    }
  }

  /** 요청 메시지를 Gemini Content 형식으로 변환 (system 역할 제외) */
  private convertMessages(request: LLMRequest): Content[] {
    return request.messages
      .filter((msg) => msg.role !== 'system')
      .map((msg) => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      }));
  }

  /** system 역할 메시지와 systemPrompt를 합산하여 단일 시스템 프롬프트 생성 */
  private extractSystemPrompt(request: LLMRequest): string | undefined {
    const systemMessages = request.messages
      .filter((msg) => msg.role === 'system')
      .map((msg) => msg.content);

    if (request.systemPrompt) {
      systemMessages.unshift(request.systemPrompt);
    }

    return systemMessages.length > 0
      ? systemMessages.join('\n\n')
      : undefined;
  }
}
