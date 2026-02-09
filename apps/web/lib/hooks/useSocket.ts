'use client';

import { useEffect, useRef } from 'react';
import { connectToSession, disconnectSocket, getSocket, type TypedSocket } from '../socket';
import { useSocketStore } from '../stores/socketStore';

// 소켓 연결 관리 훅
export function useSocket(sessionId: string, token: string | null) {
  const connectedRef = useRef(false);
  const { setStatus, setError } = useSocketStore();

  useEffect(() => {
    if (!token || connectedRef.current) return;

    setStatus('connecting');
    const socket = connectToSession(sessionId, token);
    connectedRef.current = true;

    socket.on('connect', () => {
      setStatus('connected');
      setError(null);
    });

    socket.on('disconnect', () => {
      setStatus('disconnected');
      connectedRef.current = false;
    });

    socket.on('connect_error', (err) => {
      console.error('소켓 연결 에러:', err.message);
      setStatus('disconnected');
      setError(err.message);
      connectedRef.current = false;
    });

    socket.io.on('reconnect_attempt', () => {
      setStatus('reconnecting');
    });

    socket.io.on('reconnect', () => {
      setStatus('connected');
      setError(null);
    });

    return () => {
      disconnectSocket();
      connectedRef.current = false;
      setStatus('disconnected');
    };
  }, [sessionId, token, setStatus, setError]);

  return { socket: getSocket() as TypedSocket | null };
}
