import express from 'express';
import cors from 'cors';
import { config } from './config';
import { authMiddleware } from './middleware/auth';
import { errorHandler } from './middleware/errorHandler';
import healthRouter from './routes/health';
import sessionsRouter from './routes/sessions';
import charactersRouter from './routes/characters';
import rulebooksRouter from './routes/rulebooks';
import apiKeysRouter from './routes/apiKeys';

const app = express();

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

// 전역 에러 핸들러
app.use(errorHandler);

// 서버 시작
app.listen(config.port, () => {
  console.log(`게임 서버가 포트 ${config.port}에서 시작되었습니다. (${config.nodeEnv})`);
});

export default app;
