import { create } from 'zustand';

// 메시지 타입
type MessageType = 'player' | 'gm' | 'system' | 'ooc' | 'dice';

interface DiceResult {
  notation: string;
  rolls: number[];
  total: number;
  modifier: number;
}

interface DiceRequest {
  notation: string;
  purpose: string;
  dc?: number;
}

interface ChatMessage {
  id: string;
  type: MessageType;
  sender: string;
  content: string;
  timestamp: string;
  diceResult?: DiceResult;
  diceRequests?: DiceRequest[];
}

interface ChatState {
  messages: ChatMessage[];
  isStreaming: boolean;
  streamingContent: string;

  // 메시지 액션
  addMessage: (message: ChatMessage) => void;
  clearMessages: () => void;

  // 스트리밍 액션
  startStreaming: () => void;
  appendStreamContent: (chunk: string) => void;
  endStreaming: (finalMessage: ChatMessage) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  isStreaming: false,
  streamingContent: '',

  addMessage: (message) =>
    set((state) => ({
      messages: [...state.messages, message],
    })),

  clearMessages: () => set({ messages: [] }),

  startStreaming: () =>
    set({ isStreaming: true, streamingContent: '' }),

  appendStreamContent: (chunk) =>
    set((state) => ({
      streamingContent: state.streamingContent + chunk,
    })),

  endStreaming: (finalMessage) =>
    set((state) => ({
      isStreaming: false,
      streamingContent: '',
      messages: [...state.messages, finalMessage],
    })),
}));
