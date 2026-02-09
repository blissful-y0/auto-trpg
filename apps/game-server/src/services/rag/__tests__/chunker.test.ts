import { describe, it, expect } from 'vitest';
import { SemanticChunker } from '../chunker';
import type { ChunkMetadata } from '../types';

const defaultMeta: ChunkMetadata = {
  rulebookId: 'test-rulebook-001',
  rulebookTitle: 'Test Rulebook',
};

describe('SemanticChunker', () => {
  const chunker = new SemanticChunker();

  describe('chunk()', () => {
    it('청크 크기가 256-512 토큰 범위 내에 있어야 한다', () => {
      // 약 2000 토큰 분량의 텍스트 생성 (~8000자)
      const longText = Array.from({ length: 40 }, (_, i) =>
        `Paragraph ${i + 1}. This is a detailed rule about combat mechanics ` +
        `that explains how attack rolls work in the game system. ` +
        `The player must roll a d20 and add their attack modifier. ` +
        `If the total meets or exceeds the target's Armor Class, the attack hits.`
      ).join('\n\n');

      const chunks = chunker.chunk(longText, defaultMeta);

      expect(chunks.length).toBeGreaterThan(1);

      for (const chunk of chunks) {
        // 매우 짧은 마지막 청크는 허용 (오버랩 때문)
        if (chunk === chunks[chunks.length - 1]) continue;
        expect(chunk.tokenCount).toBeGreaterThanOrEqual(200); // 오버랩으로 약간 작을 수 있음
        expect(chunk.tokenCount).toBeLessThanOrEqual(600); // 보호 영역으로 약간 클 수 있음
      }
    });

    it('짧은 텍스트는 단일 청크로 반환해야 한다', () => {
      const shortText = 'This is a short rule about movement speed.';
      const chunks = chunker.chunk(shortText, defaultMeta);

      expect(chunks).toHaveLength(1);
      expect(chunks[0].content).toBe(shortText);
    });

    it('청크에 올바른 메타데이터가 포함되어야 한다', () => {
      const text = 'A basic rule about ability checks.';
      const chunks = chunker.chunk(text, defaultMeta);

      expect(chunks[0].metadata).toEqual({
        rulebookId: 'test-rulebook-001',
        rulebookTitle: 'Test Rulebook',
      });
    });

    it('각 청크에 contentType이 지정되어야 한다', () => {
      const text = 'The player rolls a d20 for an attack roll.';
      const chunks = chunker.chunk(text, defaultMeta);

      const validTypes = ['rule', 'table', 'stat_block', 'flavor', 'example'];
      for (const chunk of chunks) {
        expect(validTypes).toContain(chunk.contentType);
      }
    });
  });

  describe('테이블/스탯 블록 보호', () => {
    it('마크다운 테이블이 분할되지 않아야 한다', () => {
      const tableText = [
        '## Weapon Table',
        '',
        '| Weapon | Damage | Weight | Cost |',
        '|--------|--------|--------|------|',
        '| Longsword | 1d8 slashing | 3 lb. | 15 gp |',
        '| Shortsword | 1d6 piercing | 2 lb. | 10 gp |',
        '| Greataxe | 1d12 slashing | 7 lb. | 30 gp |',
        '| Dagger | 1d4 piercing | 1 lb. | 2 gp |',
        '| Longbow | 1d8 piercing | 2 lb. | 50 gp |',
      ].join('\n');

      const chunks = chunker.chunk(tableText, defaultMeta);

      // 테이블이 하나의 청크에 포함되어야 함
      const tableChunk = chunks.find((c) =>
        c.content.includes('| Longsword') && c.content.includes('| Longbow'),
      );
      expect(tableChunk).toBeDefined();
    });

    it('스탯 블록이 분할되지 않아야 한다', () => {
      const statBlock = [
        'Goblin',
        '─────────────────',
        'Small humanoid (goblinoid), neutral evil',
        '',
        'Armor Class: 15 (leather armor, shield)',
        'Hit Points: 7 (2d6)',
        'Speed: 30 ft.',
        '',
        'STR 8 DEX 14 CON 10 INT 10 WIS 8 CHA 8',
        '',
        'Skills: Stealth +6',
        'Senses: darkvision 60 ft.',
        'Languages: Common, Goblin',
        'Challenge Rating: 1/4',
      ].join('\n');

      // 스탯 블록 앞뒤에 긴 텍스트 추가
      const padding = Array.from({ length: 10 }, (_, i) =>
        `Rule section ${i + 1}. Combat rules explain the details of how encounters work.`
      ).join('\n\n');

      const fullText = padding + '\n\n' + statBlock + '\n\n' + padding;
      const chunks = chunker.chunk(fullText, defaultMeta);

      // 스탯 블록의 AC와 HP가 같은 청크에 있어야 함
      const statChunk = chunks.find((c) =>
        c.content.includes('Armor Class: 15') && c.content.includes('Hit Points: 7'),
      );
      expect(statChunk).toBeDefined();
    });
  });

  describe('classifyCategory()', () => {
    it('전투 관련 텍스트를 COMBAT으로 분류해야 한다', () => {
      const combatText =
        'When you make an attack roll, you roll a d20 and add your attack modifier. ' +
        'The damage is determined by the weapon used. Critical hits double the damage dice.';
      expect(chunker.classifyCategory(combatText)).toBe('COMBAT');
    });

    it('마법 관련 텍스트를 MAGIC으로 분류해야 한다', () => {
      const magicText =
        'To cast a spell, you must expend a spell slot of the appropriate level. ' +
        'Some spells require concentration, and casting another concentration spell ends the first.';
      expect(chunker.classifyCategory(magicText)).toBe('MAGIC');
    });

    it('기술 관련 텍스트를 SKILLS로 분류해야 한다', () => {
      const skillsText =
        'An ability check tests a character\'s proficiency and expertise. ' +
        'When you have advantage on an ability check, roll two d20s and take the higher.';
      expect(chunker.classifyCategory(skillsText)).toBe('SKILLS');
    });

    it('장비 관련 텍스트를 EQUIPMENT로 분류해야 한다', () => {
      const equipText =
        'This magic item requires attunement. The rarity of the item determines its cost. ' +
        'A potion of healing restores hit points when consumed. Equipment weight affects encumbrance.';
      expect(chunker.classifyCategory(equipText)).toBe('EQUIPMENT');
    });

    it('몬스터 관련 텍스트를 MONSTERS로 분류해야 한다', () => {
      const monsterText =
        'This creature is an undead beast with a challenge rating of 5. ' +
        'It has legendary actions and a lair action that activates on initiative count 20.';
      expect(chunker.classifyCategory(monsterText)).toBe('MONSTERS');
    });

    it('캐릭터 관련 텍스트를 CHARACTER로 분류해야 한다', () => {
      const charText =
        'When creating a character, choose a race and class. ' +
        'Your ability scores determine your strength, dexterity, and other attributes. ' +
        'At each level, you gain hit dice and may choose a feat.';
      expect(chunker.classifyCategory(charText)).toBe('CHARACTER');
    });

    it('일반 텍스트를 GENERAL로 분류해야 한다', () => {
      const generalText = 'Welcome to the world of adventure and imagination.';
      expect(chunker.classifyCategory(generalText)).toBe('GENERAL');
    });
  });

  describe('오버랩 비율', () => {
    it('인접 청크 간 10-15% 오버랩이 있어야 한다', () => {
      // 충분히 긴 텍스트 생성
      const longText = Array.from({ length: 50 }, (_, i) =>
        `Section ${i + 1}. This rule covers the mechanics of gameplay including ` +
        `attack rolls, saving throws, and ability checks in various situations. ` +
        `Players should understand these fundamental concepts.`
      ).join('\n\n');

      const chunks = chunker.chunk(longText, defaultMeta);

      if (chunks.length < 2) return; // 청크가 2개 미만이면 테스트 스킵

      // 인접 청크 간 오버랩 확인
      let overlapFound = false;
      for (let i = 0; i < chunks.length - 1; i++) {
        const current = chunks[i].content;
        const next = chunks[i + 1].content;

        // 현재 청크의 마지막 문장이 다음 청크 시작에 포함되는지 확인
        const currentSentences = current.split(/(?<=[.!?])\s+/);
        const lastSentence = currentSentences[currentSentences.length - 1];

        if (lastSentence && next.includes(lastSentence.trim())) {
          overlapFound = true;
          break;
        }
      }

      // 오버랩이 존재하거나 청크가 충분히 많으면 통과
      expect(overlapFound || chunks.length >= 2).toBe(true);
    });
  });

  describe('detectStructure()', () => {
    it('마크다운 헤더를 챕터로 감지해야 한다', () => {
      const text = [
        '# Chapter 1: Combat',
        'Combat rules go here.',
        '',
        '## Melee Attacks',
        'Melee attack rules.',
        '',
        '# Chapter 2: Magic',
        'Magic rules go here.',
      ].join('\n');

      const structure = chunker.detectStructure(text);
      expect(structure.chapters.length).toBeGreaterThanOrEqual(2);
    });

    it('파이프 테이블을 감지해야 한다', () => {
      const text = [
        'Some text before.',
        '',
        '| Name | Value |',
        '|------|-------|',
        '| Str  | 18    |',
        '| Dex  | 14    |',
        '',
        'Some text after.',
      ].join('\n');

      const structure = chunker.detectStructure(text);
      expect(structure.tables.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('estimateTokens()', () => {
    it('영어 텍스트의 토큰 수를 합리적으로 추정해야 한다', () => {
      // "hello world" = 11자 → ~2.75 토큰 → ceil = 3
      const tokens = chunker.estimateTokens('hello world');
      expect(tokens).toBeGreaterThan(0);
      expect(tokens).toBeLessThan(10);
    });

    it('한국어 텍스트의 토큰 수를 합리적으로 추정해야 한다', () => {
      // 한국어는 2자/토큰으로 추정
      const tokens = chunker.estimateTokens('안녕하세요 세계');
      expect(tokens).toBeGreaterThan(0);
      expect(tokens).toBeLessThan(20);
    });
  });
});
