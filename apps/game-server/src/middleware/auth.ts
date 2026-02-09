import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../lib/supabase';
import { AppError } from './errorHandler';

// Express Request에 사용자 정보 추가
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email?: string;
        role?: string;
      };
      accessToken?: string;
    }
  }
}

// Supabase JWT 검증 미들웨어
export async function authMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError(401, '인증 토큰이 필요합니다.');
    }

    const token = authHeader.substring(7);

    // Supabase로 JWT 검증
    const {
      data: { user },
      error,
    } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) {
      throw new AppError(401, '유효하지 않은 인증 토큰입니다.');
    }

    // 요청 객체에 사용자 정보 주입
    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
    };
    req.accessToken = token;

    next();
  } catch (err) {
    next(err);
  }
}
