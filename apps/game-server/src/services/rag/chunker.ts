// 규칙서 텍스트를 시맨틱 청크로 분할하는 청커
import type {
  Chunk,
  ChunkMetadata,
  ContentType,
  DocumentStructure,
  RulebookCategory,
  StructureNode,
  StructureRange,
} from './types';
import { CATEGORY_KEYWORDS, escapeRegex } from './category-keywords';

/** 청커 설정 */
interface ChunkerConfig {
  minTokens: number;
  maxTokens: number;
  overlapRatio: number;
}

const DEFAULT_CONFIG: ChunkerConfig = {
  minTokens: 256,
  maxTokens: 512,
  overlapRatio: 0.12, // 12% 오버랩
};

export class SemanticChunker {
  private config: ChunkerConfig;

  constructor(config: Partial<ChunkerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** 텍스트를 시맨틱 청크로 분할 */
  chunk(text: string, metadata: ChunkMetadata): Chunk[] {
    const structure = this.detectStructure(text);
    const protectedRanges = [
      ...structure.tables,
      ...structure.statBlocks,
    ];

    const rawSegments = this.splitByStructure(text, structure);
    const chunks: Chunk[] = [];

    for (const segment of rawSegments) {
      const segmentChunks = this.splitSegment(
        segment.content,
        segment.chapter,
        segment.section,
        protectedRanges,
        segment.globalOffset,
      );

      for (const sc of segmentChunks) {
        const category = this.classifyCategory(sc.content);
        const contentType = this.detectContentType(sc.content);
        const page = this.estimatePage(sc.globalOffset, text, metadata.pageOffset);

        chunks.push({
          content: sc.content,
          page,
          chapter: sc.chapter,
          section: sc.section,
          contentType,
          category,
          tokenCount: this.estimateTokens(sc.content),
          metadata: {
            rulebookId: metadata.rulebookId,
            rulebookTitle: metadata.rulebookTitle,
          },
        });
      }
    }

    return chunks;
  }

  /** 문서 구조 감지 (챕터, 섹션, 테이블, 스탯 블록) */
  detectStructure(text: string): DocumentStructure {
    const chapters = this.detectChapters(text);
    const tables = this.detectTables(text);
    const statBlocks = this.detectStatBlocks(text);

    return { chapters, tables, statBlocks };
  }

  /** 카테고리 분류 */
  classifyCategory(content: string): RulebookCategory {
    const lower = content.toLowerCase();
    const scores: Record<RulebookCategory, number> = {
      COMBAT: 0,
      MAGIC: 0,
      SKILLS: 0,
      EQUIPMENT: 0,
      MONSTERS: 0,
      CHARACTER: 0,
      GENERAL: 0,
    };

    for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
      for (const keyword of keywords) {
        const regex = new RegExp(`\\b${escapeRegex(keyword)}\\b`, 'gi');
        const matches = lower.match(regex);
        if (matches) {
          scores[category as RulebookCategory] += matches.length;
        }
      }
    }

    let best: RulebookCategory = 'GENERAL';
    let bestScore = 0;
    for (const [category, score] of Object.entries(scores)) {
      if (score > bestScore) {
        bestScore = score;
        best = category as RulebookCategory;
      }
    }

    return best;
  }

  /** 챕터/섹션 헤더 감지 */
  private detectChapters(text: string): StructureNode[] {
    const nodes: StructureNode[] = [];
    // 마크다운 스타일 헤더 (#, ##, ###) 또는 "Chapter N:", "PART N" 패턴
    const headerPattern = /^(#{1,4})\s+(.+)$|^(Chapter\s+\d+[.:]\s*.+)$|^(PART\s+[IVXLCDM\d]+[.:]\s*.+)$/gmi;

    let match: RegExpExecArray | null;
    while ((match = headerPattern.exec(text)) !== null) {
      const level = match[1] ? match[1].length : (match[3] ? 1 : 0);
      const title = (match[2] || match[3] || match[4] || '').trim();

      nodes.push({
        title,
        level,
        startIndex: match.index,
        endIndex: text.length, // 다음 노드 발견 시 업데이트
        children: [],
      });
    }

    // endIndex를 다음 같은 레벨 또는 상위 레벨 헤더로 업데이트
    for (let i = 0; i < nodes.length; i++) {
      if (i + 1 < nodes.length) {
        nodes[i].endIndex = nodes[i + 1].startIndex;
      }
    }

    return nodes;
  }

  /** 테이블 감지 (마크다운 파이프 테이블 또는 탭/공백 정렬 테이블) */
  private detectTables(text: string): StructureRange[] {
    const ranges: StructureRange[] = [];

    // 마크다운 파이프 테이블: |...|...|
    const pipeTablePattern = /^(\|.+\|)\n(\|[-:| ]+\|)\n((\|.+\|)\n?)*/gm;
    let match: RegExpExecArray | null;
    while ((match = pipeTablePattern.exec(text)) !== null) {
      ranges.push({
        startIndex: match.index,
        endIndex: match.index + match[0].length,
        type: 'table',
      });
    }

    // 탭 정렬 테이블 (연속 3줄 이상의 탭 구분 데이터)
    const tabTablePattern = /^(.+\t.+\n){3,}/gm;
    while ((match = tabTablePattern.exec(text)) !== null) {
      ranges.push({
        startIndex: match.index,
        endIndex: match.index + match[0].length,
        type: 'table',
      });
    }

    return ranges;
  }

  /** 스탯 블록 감지 (D&D 스타일 몬스터/NPC 블록) */
  private detectStatBlocks(text: string): StructureRange[] {
    const ranges: StructureRange[] = [];

    // 스탯 블록 패턴: "Armor Class" + "Hit Points" + "Speed" 가 연속으로 나오는 영역
    const statBlockPattern =
      /(?:^|\n)([\w\s,]+(?:\n[-─━]+\n|\n))[\s\S]*?(?:Armor Class|AC)\s*[:.]?\s*\d+[\s\S]*?(?:Hit Points|HP)\s*[:.]?\s*\d+[\s\S]*?(?:Speed|SPD)\s*[:.]?\s*\d+[\s\S]*?(?=\n\n\n|\n#{1,4}\s|\Z)/gmi;

    let match: RegExpExecArray | null;
    while ((match = statBlockPattern.exec(text)) !== null) {
      ranges.push({
        startIndex: match.index,
        endIndex: match.index + match[0].length,
        type: 'stat_block',
      });
    }

    return ranges;
  }

  /** 구조 기반으로 텍스트를 세그먼트로 나누기 */
  private splitByStructure(
    text: string,
    structure: DocumentStructure,
  ): Array<{ content: string; chapter?: string; section?: string; globalOffset: number }> {
    const segments: Array<{
      content: string;
      chapter?: string;
      section?: string;
      globalOffset: number;
    }> = [];

    if (structure.chapters.length === 0) {
      segments.push({ content: text, globalOffset: 0 });
      return segments;
    }

    // 첫 번째 챕터 이전 텍스트
    if (structure.chapters[0].startIndex > 0) {
      segments.push({
        content: text.slice(0, structure.chapters[0].startIndex),
        globalOffset: 0,
      });
    }

    for (const chapter of structure.chapters) {
      const content = text.slice(chapter.startIndex, chapter.endIndex);
      segments.push({
        content,
        chapter: chapter.title,
        section: chapter.level >= 2 ? chapter.title : undefined,
        globalOffset: chapter.startIndex,
      });
    }

    return segments;
  }

  /** 세그먼트를 토큰 제한에 맞게 분할 */
  private splitSegment(
    content: string,
    chapter?: string,
    section?: string,
    protectedRanges: StructureRange[] = [],
    globalOffset = 0,
  ): Array<{ content: string; chapter?: string; section?: string; globalOffset: number }> {
    const tokens = this.estimateTokens(content);
    if (tokens <= this.config.maxTokens) {
      return [{ content: content.trim(), chapter, section, globalOffset }];
    }

    const results: Array<{
      content: string;
      chapter?: string;
      section?: string;
      globalOffset: number;
    }> = [];

    // 보호 영역 내부인지 확인
    const isProtected = (startIdx: number, endIdx: number) => {
      const absStart = globalOffset + startIdx;
      const absEnd = globalOffset + endIdx;
      return protectedRanges.some(
        (r) => absStart >= r.startIndex && absEnd <= r.endIndex,
      );
    };

    // 문단 기준으로 분할
    const paragraphs = content.split(/\n\n+/);
    let currentChunk = '';
    let currentOffset = globalOffset;
    let charPos = 0;

    for (const para of paragraphs) {
      // 보호 영역이면 개별 청크로
      if (isProtected(charPos, charPos + para.length) && para.trim()) {
        if (currentChunk.trim()) {
          results.push({
            content: currentChunk.trim(),
            chapter,
            section,
            globalOffset: currentOffset,
          });
        }
        results.push({
          content: para.trim(),
          chapter,
          section,
          globalOffset: globalOffset + charPos,
        });
        currentChunk = '';
        currentOffset = globalOffset + charPos + para.length;
        charPos += para.length + 2; // \n\n
        continue;
      }

      const combinedTokens = this.estimateTokens(currentChunk + '\n\n' + para);
      if (combinedTokens > this.config.maxTokens && currentChunk.trim()) {
        results.push({
          content: currentChunk.trim(),
          chapter,
          section,
          globalOffset: currentOffset,
        });

        // 오버랩: 이전 청크의 마지막 부분을 다음 청크 시작에 포함
        const overlapTokens = Math.floor(
          this.estimateTokens(currentChunk) * this.config.overlapRatio,
        );
        const overlapText = this.getTrailingText(currentChunk, overlapTokens);
        currentChunk = overlapText + '\n\n' + para;
        currentOffset = globalOffset + charPos - overlapText.length;
      } else {
        currentChunk = currentChunk ? currentChunk + '\n\n' + para : para;
      }

      charPos += para.length + 2;
    }

    if (currentChunk.trim()) {
      results.push({
        content: currentChunk.trim(),
        chapter,
        section,
        globalOffset: currentOffset,
      });
    }

    return results;
  }

  /** 콘텐츠 유형 감지 */
  private detectContentType(content: string): ContentType {
    // 테이블 감지
    if (/\|.+\|/.test(content) && /\|[-:| ]+\|/.test(content)) {
      return 'table';
    }

    // 스탯 블록 감지
    if (/(?:Armor Class|AC)\s*[:.]?\s*\d+/i.test(content) &&
        /(?:Hit Points|HP)\s*[:.]?\s*\d+/i.test(content)) {
      return 'stat_block';
    }

    // 예시 감지
    if (/(?:example|for instance|e\.g\.|예[시를]|예를 들)/i.test(content)) {
      return 'example';
    }

    // 플레이버 텍스트 감지 (이탤릭이나 인용구)
    if (/^>|^\*[^*]+\*$/m.test(content)) {
      return 'flavor';
    }

    return 'rule';
  }

  /** 토큰 수 추정 (영어 기준 ~4문자/토큰, 한국어 ~2문자/토큰) */
  estimateTokens(text: string): number {
    // 한국어 문자 수
    const koreanChars = (text.match(/[\uAC00-\uD7AF\u3130-\u318F\u1100-\u11FF]/g) || []).length;
    const otherChars = text.length - koreanChars;
    return Math.ceil(koreanChars / 2 + otherChars / 4);
  }

  /** 페이지 번호 추정 */
  private estimatePage(
    offset: number,
    fullText: string,
    pageOffset = 0,
  ): number | undefined {
    // 폼피드 문자나 "Page N" 패턴으로 페이지 경계 찾기
    const beforeText = fullText.slice(0, offset);
    const pageBreaks = (beforeText.match(/\f/g) || []).length;
    if (pageBreaks > 0) {
      return pageBreaks + 1 + pageOffset;
    }

    // 약 3000자당 1페이지로 추정
    return Math.floor(offset / 3000) + 1 + pageOffset;
  }

  /** 텍스트 끝에서 지정 토큰 수만큼 추출 */
  private getTrailingText(text: string, targetTokens: number): string {
    if (targetTokens <= 0) return '';
    const sentences = text.split(/(?<=[.!?。])\s+/);
    let result = '';
    for (let i = sentences.length - 1; i >= 0; i--) {
      const candidate = sentences[i] + (result ? ' ' + result : '');
      if (this.estimateTokens(candidate) > targetTokens) break;
      result = candidate;
    }
    return result;
  }
}
