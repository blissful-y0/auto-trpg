// UUID v4 생성 유틸리티

/**
 * 크립토 기반 UUID v4 생성
 * Node.js 20+ 환경의 crypto.randomUUID() 활용
 */
export function generateId(): string {
  // Node.js 20+ 및 최신 브라우저 모두 지원
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  // 폴백: Math.random 기반 UUID v4
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
