// 간단한 토큰 카운터 (tiktoken 의존 없이 근사치 계산)

/** 한국어 문자 범위 판별 */
function isKorean(char: string): boolean {
  const code = char.charCodeAt(0);
  // 한글 음절: U+AC00–U+D7AF, 한글 자모: U+1100–U+11FF, 호환 자모: U+3130–U+318F
  return (
    (code >= 0xac00 && code <= 0xd7af) ||
    (code >= 0x1100 && code <= 0x11ff) ||
    (code >= 0x3130 && code <= 0x318f)
  );
}

/**
 * 텍스트의 토큰 수를 근사치로 계산
 *
 * - 영어: 단어 수 × 1.3
 * - 한국어: 글자 수 × 0.5
 * - 혼합 텍스트: 각각 분리 후 합산
 */
export function estimateTokenCount(text: string): number {
  if (!text) return 0;

  let koreanCharCount = 0;
  let nonKoreanText = '';

  for (const char of text) {
    if (isKorean(char)) {
      koreanCharCount++;
    } else {
      nonKoreanText += char;
    }
  }

  // 한국어 토큰: 글자 수 × 0.5
  const koreanTokens = koreanCharCount * 0.5;

  // 영어/기타 토큰: 단어 수 × 1.3
  const words = nonKoreanText.trim().split(/\s+/).filter(Boolean);
  const nonKoreanTokens = words.length * 1.3;

  return Math.ceil(koreanTokens + nonKoreanTokens);
}
