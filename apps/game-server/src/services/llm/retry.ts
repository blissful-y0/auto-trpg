/**
 * LLM API 재시도 유틸리티 — 지수 백오프
 *
 * 네트워크 에러, 429(Rate Limit), 5xx(서버 에러) 시 자동 재시도.
 */

/** 재시도 가능한 에러인지 판별 */
export function isRetryableError(error: unknown): boolean {
  if (error && typeof error === 'object') {
    // Anthropic/OpenAI SDK: status 속성으로 HTTP 상태 코드 노출
    const status = (error as { status?: number }).status;
    if (typeof status === 'number') {
      return status === 429 || (status >= 500 && status < 600);
    }

    // 네트워크 에러 코드 (Node.js)
    const code = (error as { code?: string }).code;
    if (
      typeof code === 'string' &&
      ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EPIPE', 'ENOTFOUND'].includes(code)
    ) {
      return true;
    }
  }

  // fetch 실패 등 메시지 기반 감지
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('fetch failed') || msg.includes('network') || msg.includes('socket hang up')) {
      return true;
    }
  }

  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 지수 백오프 재시도 래퍼
 *
 * @param fn 실행할 비동기 함수
 * @param providerName 로깅용 프로바이더 이름
 * @param operationName 로깅용 작업 이름
 * @param maxAttempts 최대 시도 횟수 (기본 3)
 * @param baseDelayMs 기본 지연 시간 (기본 1000ms → 1s, 2s, 4s)
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  providerName: string,
  operationName: string,
  maxAttempts: number = 3,
  baseDelayMs: number = 1000,
): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const retryable = isRetryableError(error);
      const isLast = attempt === maxAttempts;

      console.error(
        `[${providerName}] ${operationName} 실패 (시도 ${attempt}/${maxAttempts}):`,
        error instanceof Error ? error.message : error,
      );

      if (!retryable || isLast) {
        throw error;
      }

      const delay = baseDelayMs * Math.pow(2, attempt - 1);
      console.warn(`[${providerName}] ${delay}ms 후 재시도...`);
      await sleep(delay);
    }
  }

  throw new Error('unreachable');
}
