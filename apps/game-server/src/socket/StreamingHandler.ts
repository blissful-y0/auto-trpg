// GM 응답 스트리밍 핸들러 — LLM 스트림을 Socket.io로 중계

import type { Server } from 'socket.io';
import type { ClientEvents, ServerEvents, SocketData } from './types';

// LLM 스트림 청크 타입
export interface LLMStreamChunk {
  content: string;
  done: boolean;
}

// AsyncGenerator를 받아서 Socket.io로 스트리밍 전송
export async function handleStreaming(
  io: Server<ClientEvents, ServerEvents, Record<string, never>, SocketData>,
  sessionId: string,
  streamGenerator: AsyncGenerator<LLMStreamChunk>,
): Promise<string> {
  let fullContent = '';

  for await (const chunk of streamGenerator) {
    fullContent += chunk.content;

    io.to(sessionId).emit('gm:stream', {
      sessionId,
      chunk: chunk.content,
      done: chunk.done,
    });
  }

  // 마지막 done 시그널 보장
  io.to(sessionId).emit('gm:stream', {
    sessionId,
    chunk: '',
    done: true,
  });

  return fullContent;
}
