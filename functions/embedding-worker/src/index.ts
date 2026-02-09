// 임베딩 워커 — 청킹 + 임베딩 생성 + pgvector 저장
// Lambda 또는 로컬 실행 가능

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

/** 워커 이벤트 */
interface WorkerEvent {
  rulebookId: string;
  /** S3 결과 키 또는 직접 텍스트 */
  textResultKey?: string;
  text?: string;
}

/** 워커 결과 */
interface WorkerResult {
  rulebookId: string;
  chunksCreated: number;
  status: 'completed' | 'failed';
  error?: string;
}

// 환경변수에서 서비스 클라이언트 초기화
const supabase = createClient(
  process.env.SUPABASE_URL ?? '',
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const EMBEDDING_MODEL = 'text-embedding-3-small';
const BATCH_SIZE = 100;

/** 메인 핸들러 */
export async function handler(event: WorkerEvent): Promise<WorkerResult> {
  const { rulebookId } = event;

  try {
    // 텍스트 가져오기
    let text = event.text ?? '';

    if (!text && event.textResultKey) {
      // S3에서 텍스트 결과 가져오기 (Supabase Storage 사용)
      const { data, error } = await supabase.storage
        .from('rulebooks')
        .download(event.textResultKey);

      if (error) throw new Error(`텍스트 다운로드 실패: ${error.message}`);

      const json = JSON.parse(await data.text());
      text = json.full_text;
    }

    if (!text) {
      throw new Error('처리할 텍스트가 없습니다');
    }

    // 간단한 청킹 (SemanticChunker의 경량 버전)
    const chunks = simpleChunk(text, 512);

    // 배치 임베딩 + 저장
    let totalChunks = 0;

    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);
      const texts = batch.map((c) => c.content);

      // 임베딩 생성
      const embeddingResponse = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: texts,
      });

      // DB 저장
      const records = batch.map((chunk, idx) => ({
        rulebook_id: rulebookId,
        content: chunk.content,
        embedding: embeddingResponse.data[idx].embedding,
        page: chunk.page,
        content_type: 'rule',
        category: 'GENERAL',
        token_count: chunk.tokenCount,
        metadata: {},
      }));

      const { error } = await supabase
        .from('rulebook_chunks')
        .insert(records);

      if (error) throw new Error(`청크 저장 실패: ${error.message}`);

      totalChunks += records.length;
    }

    // 상태 업데이트
    await supabase
      .from('rulebooks')
      .update({
        processing_status: 'completed',
        processed_at: new Date().toISOString(),
      })
      .eq('id', rulebookId);

    return {
      rulebookId,
      chunksCreated: totalChunks,
      status: 'completed',
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : '알 수 없는 오류';

    await supabase
      .from('rulebooks')
      .update({
        processing_status: 'failed',
        processing_error: message,
      })
      .eq('id', rulebookId);

    return {
      rulebookId,
      chunksCreated: 0,
      status: 'failed',
      error: message,
    };
  }
}

/** 간단한 청킹 (문단 기반) */
function simpleChunk(
  text: string,
  maxTokens: number,
): Array<{ content: string; page: number | null; tokenCount: number }> {
  const paragraphs = text.split(/\n\n+/);
  const chunks: Array<{ content: string; page: number | null; tokenCount: number }> = [];
  let current = '';
  let pageEstimate = 1;
  let charCount = 0;

  for (const para of paragraphs) {
    const combined = current ? current + '\n\n' + para : para;
    const tokens = Math.ceil(combined.length / 4);

    if (tokens > maxTokens && current) {
      chunks.push({
        content: current.trim(),
        page: pageEstimate,
        tokenCount: Math.ceil(current.length / 4),
      });
      current = para;
    } else {
      current = combined;
    }

    charCount += para.length + 2;
    pageEstimate = Math.floor(charCount / 3000) + 1;
  }

  if (current.trim()) {
    chunks.push({
      content: current.trim(),
      page: pageEstimate,
      tokenCount: Math.ceil(current.length / 4),
    });
  }

  return chunks;
}
