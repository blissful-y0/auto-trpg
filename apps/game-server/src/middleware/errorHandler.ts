import { Request, Response, NextFunction } from 'express';

// 운영 에러를 구분하기 위한 커스텀 에러 클래스
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly errorCode?: string;

  constructor(statusCode: number, message: string, isOperational = true, errorCode?: string) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.errorCode = errorCode;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

// 전역 에러 핸들러 미들웨어
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      status: 'error',
      message: err.message,
      ...(err.errorCode ? { code: err.errorCode } : {}),
      ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
    });
    return;
  }

  // 예상하지 못한 에러
  console.error('처리되지 않은 에러:', err);
  res.status(500).json({
    status: 'error',
    message: '서버 내부 오류가 발생했습니다.',
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
}
