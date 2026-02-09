// GM Tool Use 스키마 — LLM 구조화 출력용

export const GM_TOOLS = [
  {
    name: 'gm_respond',
    description: 'GM이 플레이어에게 응답합니다. 내러티브, 상태 변경, 주사위 굴림 등을 포함합니다.',
    parameters: {
      type: 'object' as const,
      properties: {
        narrative: {
          type: 'string',
          description: '플레이어에게 보여줄 내러티브 텍스트',
        },
        stateChanges: {
          type: 'array',
          description: '상태 변경 목록 (HP, 아이템 등)',
          items: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: ['hp_change', 'item_add', 'item_remove', 'condition_add', 'condition_remove', 'xp_gain', 'gold_change', 'location_change'],
                description: '변경 유형',
              },
              targetCharacterId: {
                type: 'string',
                description: '대상 캐릭터 ID',
              },
              value: {
                type: ['number', 'string', 'object'],
                description: '변경 값',
              },
              description: {
                type: 'string',
                description: '변경 설명',
              },
            },
            required: ['type', 'targetCharacterId', 'value'],
          },
        },
        diceRolls: {
          type: 'array',
          description: 'GM이 요청하는 주사위 굴림',
          items: {
            type: 'object',
            properties: {
              notation: {
                type: 'string',
                description: '주사위 표기법 (예: "1d20+5")',
              },
              purpose: {
                type: 'string',
                description: '굴림 목적 (예: "공격 판정", "피해 굴림")',
              },
              dc: {
                type: 'number',
                description: '난이도 등급 (DC)',
              },
            },
            required: ['notation', 'purpose'],
          },
        },
        rulesApplied: {
          type: 'array',
          description: '적용된 규칙 출처',
          items: {
            type: 'object',
            properties: {
              source: {
                type: 'string',
                description: '규칙서 이름',
              },
              page: {
                type: 'string',
                description: '페이지 번호 또는 섹션',
              },
              quote: {
                type: 'string',
                description: '관련 규칙 인용',
              },
            },
            required: ['source'],
          },
        },
        sceneTransition: {
          type: 'object',
          nullable: true,
          description: '장면 전환 정보',
          properties: {
            newLocation: {
              type: 'string',
              description: '새로운 장소',
            },
            timeAdvance: {
              type: 'string',
              description: '경과 시간',
            },
            mood: {
              type: 'string',
              description: '분위기',
            },
          },
        },
      },
      required: ['narrative'],
    },
  },
] as const;

// GM 응답 타입 (Tool Use 결과)
export interface GMResponse {
  narrative: string;
  stateChanges?: StateChange[];
  diceRolls?: DiceRollRequest[];
  rulesApplied?: RuleReference[];
  sceneTransition?: SceneTransition | null;
}

export interface StateChange {
  type: 'hp_change' | 'item_add' | 'item_remove' | 'condition_add' | 'condition_remove' | 'xp_gain' | 'gold_change' | 'location_change';
  targetCharacterId: string;
  value: number | string | Record<string, unknown>;
  description?: string;
}

export interface DiceRollRequest {
  notation: string;
  purpose: string;
  dc?: number;
}

export interface RuleReference {
  source: string;
  page?: string;
  quote?: string;
}

export interface SceneTransition {
  newLocation?: string;
  timeAdvance?: string;
  mood?: string;
}
