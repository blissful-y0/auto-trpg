import { create } from 'zustand';

// 소켓 연결 상태
type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

interface SocketState {
  status: ConnectionStatus;
  setStatus: (status: ConnectionStatus) => void;
  error: string | null;
  setError: (error: string | null) => void;
}

export const useSocketStore = create<SocketState>((set) => ({
  status: 'disconnected',
  setStatus: (status) => set({ status }),
  error: null,
  setError: (error) => set({ error }),
}));
