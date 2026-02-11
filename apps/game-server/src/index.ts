import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { config } from './config';
import { authMiddleware } from './middleware/auth';
import { errorHandler } from './middleware/errorHandler';
import { createSocketServer, setSocketServices } from './socket';
import healthRouter from './routes/health';
import sessionsRouter from './routes/sessions';
import charactersRouter from './routes/characters';
import rulebooksRouter from './routes/rulebooks';
import apiKeysRouter from './routes/apiKeys';
import messagesRouter from './routes/messages';
import savepointsRouter, { initSavepointRoutes } from './routes/savepoints';
import campaignsRouter from './routes/campaigns';
import { SaveManager } from './services/redis/SaveManager';
import { PersistenceManager } from './services/redis/PersistenceManager';

const app = express();

// 서비스 인스턴스 생성 및 연결
const saveManager = new SaveManager();
const persistenceManager = new PersistenceManager(undefined, undefined, saveManager);
initSavepointRoutes(saveManager, persistenceManager);

// 기본 미들웨어
app.use(cors({ origin: config.cors.origin, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// 헬스체크 (인증 불필요)
app.use('/api/health', healthRouter);

// 인증 필요 라우트
app.use('/api/sessions', authMiddleware, sessionsRouter);
app.use('/api', authMiddleware, charactersRouter);
app.use('/api/rulebooks', authMiddleware, rulebooksRouter);
app.use('/api/keys', authMiddleware, apiKeysRouter);
app.use('/api/sessions/:sessionId/messages', authMiddleware, messagesRouter);
app.use('/api/sessions', authMiddleware, savepointsRouter);
app.use('/api/campaigns', authMiddleware, campaignsRouter);

// 전역 에러 핸들러
app.use(errorHandler);

// HTTP 서버 + Socket.io
const httpServer = createServer(app);
setSocketServices(saveManager, persistenceManager);
const io = createSocketServer(httpServer);

// SaveManager에 Socket.io 인스턴스 연결 (자동 세이브 인디케이터용)
saveManager.setIO(io);

httpServer.listen(config.port, () => {
  console.log(`게임 서버가 포트 ${config.port}에서 시작되었습니다. (${config.nodeEnv})`);
  console.log(`Socket.io 서버 활성화`);
});

export { app, httpServer, io };
