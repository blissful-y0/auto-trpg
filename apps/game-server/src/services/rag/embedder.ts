// OpenAI text-embedding-3-small을 사용한 임베딩 생성기
import OpenAI from 'openai';

/** 임베딩 생성기 설정 */
interface EmbedderConfig {
  model: string;
  dimensions: number;
  maxBatchSize: number;
  apiKey?: string;
}

const DEFAULT_CONFIG: EmbedderConfig = {
  model: 'text-embedding-3-small',
  dimensions: 1536,
  maxBatchSize: 2048,
};

export class Embedder {
  private client: OpenAI;
  private config: EmbedderConfig;

  constructor(config: Partial<EmbedderConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.client = new OpenAI({
      apiKey: this.config.apiKey || process.env.OPENAI_API_KEY,
    });
  }

  /** 단일 텍스트 임베딩 생성 */
  async embed(text: string): Promise<number[]> {
    const result = await this.client.embeddings.create({
      model: this.config.model,
      input: text,
      dimensions: this.config.dimensions,
    });
    return result.data[0].embedding;
  }

  /** 배치 임베딩 생성 (최대 2048개) */
  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const results: number[][] = [];

    // maxBatchSize 단위로 분할하여 처리
    for (let i = 0; i < texts.length; i += this.config.maxBatchSize) {
      const batch = texts.slice(i, i + this.config.maxBatchSize);

      const response = await this.client.embeddings.create({
        model: this.config.model,
        input: batch,
        dimensions: this.config.dimensions,
      });

      // 인덱스 순서대로 정렬하여 반환
      const sorted = [...response.data]
        .sort((a: { index: number }, b: { index: number }) => a.index - b.index)
        .map((d: { embedding: number[] }) => d.embedding);

      results.push(...sorted);
    }

    return results;
  }
}
