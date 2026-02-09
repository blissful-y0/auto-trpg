import { describe, it, expect, beforeEach } from 'vitest';
import { ContextManager, CharacterInfo, GameSessionInfo, PlayerAction } from '../ContextManager';

describe('ContextManager', () => {
  let manager: ContextManager;

  const mockSession: GameSessionInfo = {
    sessionId: 'test-session-1',
    campaignName: '잃어버린 광산',
    rulebookIds: ['dnd5e-phb', 'dnd5e-dmg'],
    setting: '포가튼 렐름',
    tone: '영웅적 판타지',
  };

  const mockCharacters: CharacterInfo[] = [
    {
      characterId: 'char-1',
      name: '엘라라',
      race: '엘프',
      class: '마법사',
      level: 3,
      hp: { current: 18, max: 20 },
      abilities: { STR: 8, DEX: 14, CON: 12, INT: 18, WIS: 13, CHA: 10 },
      skills: ['비전학', '역사'],
      inventory: ['마법 지팡이', '주문서', '구성요소 주머니'],
      conditions: [],
    },
    {
      characterId: 'char-2',
      name: '토르가',
      race: '드워프',
      class: '성직자',
      level: 3,
      hp: { current: 28, max: 28 },
      abilities: { STR: 14, DEX: 10, CON: 16, INT: 10, WIS: 16, CHA: 12 },
      skills: ['의학', '종교'],
      inventory: ['전투 망치', '사슬 갑옷', '성스러운 상징'],
      conditions: [],
    },
  ];

  beforeEach(() => {
    manager = new ContextManager();
  });

  describe('buildPrompt', () => {
    it('올바른 구조로 프롬프트 조립', async () => {
      const action: PlayerAction = {
        sessionId: 'test-session-1',
        characterId: 'char-1',
        userId: 'user-1',
        message: '동굴 입구를 살펴본다',
        isOOC: false,
      };

      const messages = await manager.buildPrompt(mockSession, action, mockCharacters);

      // 시스템 프롬프트가 포함되어야 함
      expect(messages[0].role).toBe('system');
      expect(messages[0].content).toContain('TRPG 게임 마스터');

      // 캐릭터 정보가 포함되어야 함
      const charMessage = messages.find((m) => m.content.includes('활성 캐릭터 정보'));
      expect(charMessage).toBeDefined();
      expect(charMessage!.content).toContain('엘라라');
      expect(charMessage!.content).toContain('토르가');

      // 마지막 메시지가 플레이어 액션
      const lastMessage = messages[messages.length - 1];
      expect(lastMessage.role).toBe('user');
      expect(lastMessage.content).toBe('동굴 입구를 살펴본다');
    });

    it('OOC 메시지에 [OOC] 접두사', async () => {
      const action: PlayerAction = {
        sessionId: 'test-session-1',
        characterId: 'char-1',
        userId: 'user-1',
        message: '잠깐 휴식할게요',
        isOOC: true,
      };

      const messages = await manager.buildPrompt(mockSession, action, mockCharacters);
      const lastMessage = messages[messages.length - 1];
      expect(lastMessage.content).toContain('[OOC]');
    });

    it('캐릭터 없이도 프롬프트 조립 가능', async () => {
      const action: PlayerAction = {
        sessionId: 'test-session-1',
        characterId: '',
        userId: 'user-1',
        message: '새 캐릭터를 만들고 싶어요',
        isOOC: true,
      };

      const messages = await manager.buildPrompt(mockSession, action, []);
      // 캐릭터 정보 메시지 없음
      const charMessage = messages.find((m) => m.content.includes('활성 캐릭터 정보'));
      expect(charMessage).toBeUndefined();
    });
  });

  describe('buildSystemPrompt', () => {
    it('캠페인 정보 포함', () => {
      const prompt = manager.buildSystemPrompt(mockSession);
      expect(prompt).toContain('잃어버린 광산');
      expect(prompt).toContain('포가튼 렐름');
      expect(prompt).toContain('영웅적 판타지');
      expect(prompt).toContain('dnd5e-phb');
    });

    it('GM 역할 지시사항 포함', () => {
      const prompt = manager.buildSystemPrompt(mockSession);
      expect(prompt).toContain('게임 마스터');
      expect(prompt).toContain('내러티브');
      expect(prompt).toContain('규칙');
    });
  });

  describe('formatCharacters', () => {
    it('캐릭터 시트 포맷팅', () => {
      const formatted = manager.formatCharacters(mockCharacters);

      expect(formatted).toContain('엘라라');
      expect(formatted).toContain('엘프 마법사 Lv.3');
      expect(formatted).toContain('HP: 18/20');
      expect(formatted).toContain('INT: 18');
      expect(formatted).toContain('마법 지팡이');

      expect(formatted).toContain('토르가');
      expect(formatted).toContain('드워프 성직자 Lv.3');
      expect(formatted).toContain('HP: 28/28');
    });

    it('상태이상 표시', () => {
      const charWithCondition: CharacterInfo[] = [
        {
          ...mockCharacters[0],
          conditions: ['중독', '기절'],
        },
      ];
      const formatted = manager.formatCharacters(charWithCondition);
      expect(formatted).toContain('중독');
      expect(formatted).toContain('기절');
    });

    it('빈 장비/스킬은 "없음" 표시', () => {
      const bareChar: CharacterInfo[] = [
        {
          ...mockCharacters[0],
          skills: [],
          inventory: [],
          conditions: [],
        },
      ];
      const formatted = manager.formatCharacters(bareChar);
      expect(formatted).toContain('없음');
    });
  });

  describe('checkBudget', () => {
    it('예산 내 메시지 → true', () => {
      const messages = [
        { role: 'system' as const, content: '짧은 시스템 프롬프트' },
        { role: 'user' as const, content: '안녕하세요' },
      ];
      expect(manager.checkBudget(messages, 120000)).toBe(true);
    });

    it('예산 초과 → false', () => {
      const longContent = 'x'.repeat(500000); // ~166k 토큰
      const messages = [{ role: 'system' as const, content: longContent }];
      expect(manager.checkBudget(messages, 120000)).toBe(false);
    });
  });

  describe('saveMessage / getRecentMessages', () => {
    it('메시지 저장 후 조회', async () => {
      await manager.saveMessage('session-1', { role: 'user', content: '첫 번째 메시지' });
      await manager.saveMessage('session-1', { role: 'assistant', content: '응답입니다' });
      await manager.saveMessage('session-1', { role: 'user', content: '두 번째 메시지' });

      const messages = await manager.getRecentMessages('session-1');
      expect(messages).toHaveLength(3);
      expect(messages[0].content).toBe('첫 번째 메시지');
      expect(messages[2].content).toBe('두 번째 메시지');
    });

    it('슬라이딩 윈도우 제한', async () => {
      for (let i = 0; i < 50; i++) {
        await manager.saveMessage('session-2', { role: 'user', content: `메시지 ${i}` });
      }

      const messages = await manager.getRecentMessages('session-2', 10);
      expect(messages).toHaveLength(10);
      expect(messages[0].content).toBe('메시지 40');
      expect(messages[9].content).toBe('메시지 49');
    });

    it('존재하지 않는 세션은 빈 배열', async () => {
      const messages = await manager.getRecentMessages('nonexistent');
      expect(messages).toHaveLength(0);
    });
  });

  describe('saveEvent', () => {
    it('이벤트 저장 에러 없음', async () => {
      await expect(
        manager.saveEvent('session-1', {
          type: 'combat_start',
          data: { participants: ['char-1', 'goblin-1'] },
          description: '전투 시작',
        }),
      ).resolves.not.toThrow();
    });
  });
});
