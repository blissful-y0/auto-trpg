// 규칙서 업로드 후 전체 처리 파이프라인 오케스트레이터
import type { SupabaseClient } from '@supabase/supabase-js';
import type { SemanticChunker } from './chunker';
import type { Embedder } from './embedder';

/** 처리 상태 */
type ProcessingStatus = 'pending' | 'extracting' | 'chunking' | 'embedding' | 'completed' | 'failed';

/** 임베딩 저장용 청크 레코드 */
interface ChunkRecord {
  rulebook_id: string;
  content: string;
  embedding: number[];
  page: number | null;
  chapter: string | null;
  section: string | null;
  content_type: string;
  category: string;
  token_count: number;
  metadata: Record<string, unknown>;
}

export class RulebookProcessor {
  private supabase: SupabaseClient;
  private chunker: SemanticChunker;
  private embedder: Embedder;
  private batchSize: number;

  constructor(
    supabase: SupabaseClient,
    chunker: SemanticChunker,
    embedder: Embedder,
    batchSize = 100,
  ) {
    this.supabase = supabase;
    this.chunker = chunker;
    this.embedder = embedder;
    this.batchSize = batchSize;
  }

  /** 전체 파이프라인: 텍스트 → 청킹 → 임베딩 → 저장 */
  async processRulebook(rulebookId: string, text: string): Promise<void> {
    try {
      // 1단계: 청킹
      await this.updateStatus(rulebookId, 'chunking');
      const chunks = this.chunker.chunk(text, { rulebookId });

      if (chunks.length === 0) {
        throw new Error('청킹 결과가 비어있습니다');
      }

      // 2단계: 임베딩 생성 (배치 처리)
      await this.updateStatus(rulebookId, 'embedding');
      const records: ChunkRecord[] = [];

      for (let i = 0; i < chunks.length; i += this.batchSize) {
        const batch = chunks.slice(i, i + this.batchSize);
        const texts = batch.map((c) => c.content);
        const embeddings = await this.embedder.embedBatch(texts);

        for (let j = 0; j < batch.length; j++) {
          const chunk = batch[j];
          records.push({
            rulebook_id: rulebookId,
            content: chunk.content,
            embedding: embeddings[j],
            page: chunk.page ?? null,
            chapter: chunk.chapter ?? null,
            section: chunk.section ?? null,
            content_type: chunk.contentType,
            category: chunk.category,
            token_count: chunk.tokenCount,
            metadata: chunk.metadata,
          });
        }
      }

      // 3단계: DB 저장 (배치 삽입)
      for (let i = 0; i < records.length; i += this.batchSize) {
        const batch = records.slice(i, i + this.batchSize);
        const { error } = await this.supabase
          .from('rulebook_chunks')
          .insert(batch);

        if (error) {
          throw new Error(`청크 저장 실패: ${error.message}`);
        }
      }

      // 완료
      await this.updateStatus(rulebookId, 'completed');
    } catch (err) {
      const message = err instanceof Error ? err.message : '알 수 없는 오류';
      await this.updateStatus(rulebookId, 'failed', message);
      throw err;
    }
  }

  /** 처리 상태 업데이트 */
  async updateStatus(
    rulebookId: string,
    status: ProcessingStatus,
    error?: string,
  ): Promise<void> {
    const update: Record<string, unknown> = {
      processing_status: status,
      updated_at: new Date().toISOString(),
    };

    if (error) {
      update.processing_error = error;
    }

    if (status === 'completed') {
      update.status = 'ready';
      update.processed_at = new Date().toISOString();
    }

    if (status === 'failed') {
      update.status = 'error';
    }

    const { error: dbError } = await this.supabase
      .from('rulebooks')
      .update(update)
      .eq('id', rulebookId);

    if (dbError) {
      console.error(`상태 업데이트 실패 [${rulebookId}]: ${dbError.message}`);
    }
  }
}
