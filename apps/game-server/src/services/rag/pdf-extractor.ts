// S3에서 PDF 다운로드 후 텍스트 추출
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { PDFParse } from 'pdf-parse';
import { config } from '../../config';

const s3Client = new S3Client({
  region: config.aws.region,
  credentials: {
    accessKeyId: config.aws.accessKeyId,
    secretAccessKey: config.aws.secretAccessKey,
  },
});

interface ExtractionResult {
  text: string;
  pageCount: number;
}

/** S3에서 PDF를 다운로드하여 텍스트를 추출합니다 */
export async function extractTextFromS3(s3Key: string): Promise<ExtractionResult> {
  // S3에서 PDF 다운로드
  const command = new GetObjectCommand({
    Bucket: config.aws.s3Bucket,
    Key: s3Key,
  });

  const response = await s3Client.send(command);

  if (!response.Body) {
    throw new Error('S3에서 파일을 가져올 수 없습니다');
  }

  // ReadableStream → Buffer 변환
  const chunks: Uint8Array[] = [];
  const stream = response.Body as AsyncIterable<Uint8Array>;
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  const buffer = Buffer.concat(chunks);

  // PDF 텍스트 추출 (pdf-parse v2 API)
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  const textResult = await parser.getText();

  if (!textResult.text || textResult.text.trim().length === 0) {
    await parser.destroy();
    throw new Error('PDF에서 텍스트를 추출할 수 없습니다 (스캔된 이미지 PDF일 수 있음)');
  }

  const pageCount = textResult.total;
  const text = textResult.text;

  await parser.destroy();

  return { text, pageCount };
}
