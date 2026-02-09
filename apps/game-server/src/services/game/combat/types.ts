// 전투 시스템 타입 정의 — D&D 5e 기반

// ─── 상태이상 (D&D 5e 15종) ─────────────────────────

export type Condition =
  | 'blinded'       // 실명
  | 'charmed'       // 매혹
  | 'deafened'      // 청각상실
  | 'exhaustion'    // 피로
  | 'frightened'    // 공포
  | 'grappled'      // 잡기
  | 'incapacitated' // 무력화
  | 'invisible'     // 투명
  | 'paralyzed'     // 마비
  | 'petrified'     // 석화
  | 'poisoned'      // 중독
  | 'prone'         // 엎드림
  | 'restrained'    // 속박
  | 'stunned'       // 기절
  | 'unconscious';  // 의식불명

// 상태이상 한글 이름 매핑
export const CONDITION_NAMES_KO: Record<Condition, string> = {
  blinded: '실명',
  charmed: '매혹',
  deafened: '청각상실',
  exhaustion: '피로',
  frightened: '공포',
  grappled: '잡기',
  incapacitated: '무력화',
  invisible: '투명',
  paralyzed: '마비',
  petrified: '석화',
  poisoned: '중독',
  prone: '엎드림',
  restrained: '속박',
  stunned: '기절',
  unconscious: '의식불명',
};

// 적용된 상태이상 인스턴스
export interface AppliedCondition {
  condition: Condition;
  sourceId: string;       // 누가 부여했는지
  duration: number;       // 남은 턴 수 (-1 = 영구, 세이빙 스로우로 해제)
  saveDC?: number;        // 해제 DC
  saveAbility?: AbilityType; // 해제용 능력치
}

// ─── 피해 타입 (D&D 5e 13종) ─────────────────────────

export type DamageType =
  | 'bludgeoning'   // 타격
  | 'piercing'      // 관통
  | 'slashing'      // 참격
  | 'fire'          // 화염
  | 'cold'          // 냉기
  | 'lightning'     // 번개
  | 'thunder'       // 천둥
  | 'poison'        // 독
  | 'acid'          // 산
  | 'necrotic'      // 괴사
  | 'radiant'       // 광휘
  | 'force'         // 역장
  | 'psychic';      // 정신

// 능력치 타입
export type AbilityType = 'strength' | 'dexterity' | 'constitution' | 'intelligence' | 'wisdom' | 'charisma';

// ─── 공격 결과 ───────────────────────────────────────

export interface AttackResult {
  hit: boolean;
  critical: boolean;
  fumble: boolean;
  attackRoll: number;      // d20 순수 굴림값
  total: number;           // 최종 공격 판정값 (d20 + modifier)
  targetAC: number;
  damage?: number;
  damageType?: DamageType;
  damageRolls?: number[];  // 피해 다이스 굴림 결과
}

// ─── 전투 참가자 확장 ────────────────────────────────

export interface EnhancedCombatant {
  characterId: string;
  name: string;
  initiative: number;
  isPlayer: boolean;
  hpCurrent: number;
  hpMax: number;
  armorClass: number;
  conditions: AppliedCondition[];
  abilities: Record<AbilityType, number>;
  proficiencyBonus: number;
}

// ─── 전투 상태 확장 ──────────────────────────────────

export interface EnhancedCombatState {
  sessionId: string;
  isActive: boolean;
  round: number;
  currentTurnIndex: number;
  combatants: EnhancedCombatant[];
  turnTimerSeconds: number;   // 턴 타이머 (기본 180초 = 3분)
  turnStartedAt?: string;     // 현재 턴 시작 시간
  log: CombatLogEntry[];      // 전투 로그 (최근 N개)
}

// 전투 로그 항목
export interface CombatLogEntry {
  round: number;
  turn: number;
  actorId: string;
  actorName: string;
  action: string;
  result: string;
  timestamp: string;
}

// ─── 피해 계산 입력 ──────────────────────────────────

export interface DamageInput {
  damageDice: string;      // 예: "1d8", "2d6"
  damageModifier: number;  // 능력치 보정치
  damageType: DamageType;
  isCritical: boolean;     // 크리티컬 시 다이스 2배
}

// ─── 직렬화용 ────────────────────────────────────────

export interface SerializedCombatant {
  characterId: string;
  name: string;
  initiative: number;
  isPlayer: boolean;
  hpCurrent: number;
  hpMax: number;
  armorClass: number;
  conditions: AppliedCondition[];
  abilities: Record<string, number>;
  proficiencyBonus: number;
}
