import { create } from 'zustand';

// 세이브포인트 목록 항목
interface SavePointItem {
  id: string;
  saveType: 'manual' | 'auto' | 'pause';
  name: string;
  sceneNumber: number;
  characterCount: number;
  createdBy: string;
  createdAt: string;
}

// 자동 세이브 상태
type AutoSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface SaveState {
  savePoints: SavePointItem[];
  isLoading: boolean;
  isSaving: boolean;
  autoSaveStatus: AutoSaveStatus;
  lastAutoSaveAt: string | null;

  setSavePoints: (points: SavePointItem[]) => void;
  addSavePoint: (point: SavePointItem) => void;
  removeSavePoint: (id: string) => void;
  setIsLoading: (loading: boolean) => void;
  setIsSaving: (saving: boolean) => void;
  setAutoSaveStatus: (status: AutoSaveStatus) => void;
  setLastAutoSaveAt: (timestamp: string) => void;
  clearSavePoints: () => void;
}

export const useSaveStore = create<SaveState>((set) => ({
  savePoints: [],
  isLoading: false,
  isSaving: false,
  autoSaveStatus: 'idle',
  lastAutoSaveAt: null,

  setSavePoints: (points) => set({ savePoints: points, isLoading: false }),

  addSavePoint: (point) =>
    set((state) => ({
      savePoints: [point, ...state.savePoints],
      isSaving: false,
    })),

  removeSavePoint: (id) =>
    set((state) => ({
      savePoints: state.savePoints.filter((p) => p.id !== id),
    })),

  setIsLoading: (loading) => set({ isLoading: loading }),
  setIsSaving: (saving) => set({ isSaving: saving }),

  setAutoSaveStatus: (status) =>
    set({
      autoSaveStatus: status,
      ...(status === 'saved' ? { lastAutoSaveAt: new Date().toISOString() } : {}),
    }),

  setLastAutoSaveAt: (timestamp) => set({ lastAutoSaveAt: timestamp }),

  clearSavePoints: () =>
    set({
      savePoints: [],
      isLoading: false,
      isSaving: false,
      autoSaveStatus: 'idle',
      lastAutoSaveAt: null,
    }),
}));
