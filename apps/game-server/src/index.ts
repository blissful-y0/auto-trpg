import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import rateLimit from 'express-rate-limit';
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
import adminRouter from './routes/admin';
import { SaveManager } from './services/redis/SaveManager';
import { PersistenceManager } from './services/redis/PersistenceManager';

const app = express();

// 서비스 인스턴스 생성 및 연결
const saveManager = new SaveManager();
const persistenceManager = new PersistenceManager(undefined, undefined, saveManager);
initSavepointRoutes(saveManager, persistenceManager);

// HTTP Rate Limiting — 전역: 100 req/min
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '요청이 너무 빈번합니다. 1분 후 다시 시도해주세요.' },
});

// LLM 트리거 엔드포인트용 — 20 req/min (세션/메시지 POST)
const llmLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'LLM 요청 한도를 초과했습니다. 1분 후 다시 시도해주세요.' },
});

// 기본 미들웨어
app.use(cors({ origin: config.cors.origin, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(generalLimiter);

// 헬스체크 (인증 불필요)
app.use('/api/health', healthRouter);

// 인증 필요 라우트
app.use('/api/sessions', authMiddleware, sessionsRouter);
app.use('/api', authMiddleware, charactersRouter);
app.use('/api/rulebooks', authMiddleware, rulebooksRouter);
app.use('/api/keys', authMiddleware, apiKeysRouter);
app.use('/api/sessions/:sessionId/messages', authMiddleware, llmLimiter, messagesRouter);
app.use('/api/sessions', authMiddleware, savepointsRouter);
app.use('/api/campaigns', authMiddleware, campaignsRouter);
app.use('/api/admin', authMiddleware, adminRouter);

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
