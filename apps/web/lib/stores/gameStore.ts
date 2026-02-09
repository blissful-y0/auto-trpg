import { create } from 'zustand';

// 게임 세션 상태
interface GameSession {
  id: string;
  name: string;
  system: string;
  status: 'active' | 'paused' | 'completed';
  maxPlayers: number;
  currentRound: number;
}

// 캐릭터 상태
interface Character {
  id: string;
  name: string;
  race: string;
  class: string;
  level: number;
  hp: { current: number; max: number };
  ac: number;
  abilities: Record<string, { score: number; modifier: number }>;
  inventory: string[];
}

// 전투 참여자
interface Combatant {
  id: string;
  name: string;
  initiative: number;
  hp: { current: number; max: number };
  ac: number;
  isPlayer: boolean;
  isCurrentTurn: boolean;
}

interface GameState {
  session: GameSession | null;
  character: Character | null;
  combatants: Combatant[];
  isInCombat: boolean;
  currentRound: number;

  // 세션 액션
  setSession: (session: GameSession | null) => void;

  // 캐릭터 액션
  setCharacter: (character: Character | null) => void;
  updateHp: (current: number) => void;

  // 전투 액션
  startCombat: (combatants: Combatant[]) => void;
  endCombat: () => void;
  nextTurn: () => void;
}

export const useGameStore = create<GameState>((set) => ({
  session: null,
  character: null,
  combatants: [],
  isInCombat: false,
  currentRound: 0,

  setSession: (session) => set({ session }),

  setCharacter: (character) => set({ character }),

  updateHp: (current) =>
    set((state) => ({
      character: state.character
        ? { ...state.character, hp: { ...state.character.hp, current } }
        : null,
    })),

  startCombat: (combatants) =>
    set({ combatants, isInCombat: true, currentRound: 1 }),

  endCombat: () =>
    set({ combatants: [], isInCombat: false, currentRound: 0 }),

  nextTurn: () =>
    set((state) => {
      const currentIdx = state.combatants.findIndex((c) => c.isCurrentTurn);
      const nextIdx = (currentIdx + 1) % state.combatants.length;
      const newRound =
        nextIdx === 0 ? state.currentRound + 1 : state.currentRound;

      return {
        currentRound: newRound,
        combatants: state.combatants.map((c, i) => ({
          ...c,
          isCurrentTurn: i === nextIdx,
        })),
      };
    }),
}));
