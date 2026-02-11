// 카테고리별 키워드 매핑 상수 — chunker, category-classifier 공용
import type { RulebookCategory } from './types';

/** 카테고리별 키워드 (영문 + 한국어) */
export const CATEGORY_KEYWORDS: Record<RulebookCategory, string[]> = {
  COMBAT: [
    'attack', 'damage', 'hit points', 'hp', 'armor class', 'ac',
    'initiative', 'melee', 'ranged', 'weapon', 'critical',
    'saving throw', 'death save', 'grapple', 'opportunity attack',
    '공격', '전투', '피해', '명중', '방어도',
  ],
  MAGIC: [
    'spell', 'cantrip', 'slot', 'casting', 'concentration',
    'ritual', 'component', 'verbal', 'somatic', 'material',
    'arcane', 'divine', 'evocation', 'abjuration',
    '주문', '마법', '시전', '집중',
  ],
  SKILLS: [
    'ability check', 'skill check', 'proficiency', 'expertise',
    'athletics', 'acrobatics', 'stealth', 'perception',
    'investigation', 'insight', 'persuasion', 'deception',
    'advantage', 'disadvantage',
    '기술', '숙련', '판정',
  ],
  EQUIPMENT: [
    'equipment', 'item', 'gold', 'gp', 'weight', 'encumbrance',
    'armor', 'shield', 'potion', 'scroll', 'wondrous',
    'attunement', 'magic item', 'rarity',
    '장비', '아이템', '소지품',
  ],
  MONSTERS: [
    'monster', 'creature', 'beast', 'fiend', 'undead',
    'challenge rating', 'cr', 'legendary action',
    'lair action', 'swarm', 'multiattack',
    '몬스터', '괴물', '적',
  ],
  CHARACTER: [
    'class', 'race', 'background', 'level', 'experience',
    'ability score', 'strength', 'dexterity', 'constitution',
    'intelligence', 'wisdom', 'charisma', 'hit dice',
    'alignment', 'feat', 'multiclass',
    '캐릭터', '클래스', '종족', '레벨',
  ],
  GENERAL: [
    'rule', 'game', 'player', 'dungeon master', 'dm',
    'session', 'adventure', 'campaign', 'rest', 'long rest',
    'short rest', 'movement', 'travel', 'condition',
  ],
};

/** 정규식 특수문자 이스케이프 */
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
