import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AppException } from './app.exception';
import { ErrorCode } from './error-codes';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { id?: string }>();
    const requestId = request.id ?? request.header('x-request-id') ?? 'unknown';

    if (exception instanceof AppException) {
      response.status(exception.getStatus()).json({
        success: false,
        error: {
          code: exception.code,
          message: exception.message,
        },
        meta: { requestId },
      });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      const message =
        typeof payload === 'string'
          ? payload
          : typeof payload === 'object' && payload && 'message' in payload
            ? Array.isArray((payload as { message: unknown }).message)
              ? ((payload as { message: string[] }).message).join(', ')
              : String((payload as { message: unknown }).message)
            : exception.message;

      const code =
        status === HttpStatus.UNAUTHORIZED
          ? ErrorCode.AUTH_REQUIRED
          : status === HttpStatus.TOO_MANY_REQUESTS
            ? ErrorCode.RATE_LIMITED
            : status === HttpStatus.NOT_IMPLEMENTED
            ? ErrorCode.NOT_IMPLEMENTED
            : ErrorCode.VALIDATION_ERROR;

      response.status(status).json({
        success: false,
        error: { code, message },
        meta: { requestId },
      });
      return;
    }

    this.logger.error(exception);
    if (isQuotaExceeded(exception)) {
      response.status(HttpStatus.SERVICE_UNAVAILABLE).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message:
            'Firestore kotası doldu. Firebase Console kullanımını kontrol edin veya kotanın yenilenmesini bekleyin.',
        },
        meta: { requestId },
      });
      return;
    }
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
      },
      meta: { requestId },
    });
  }
}

function isQuotaExceeded(exception: unknown): boolean {
  if (!exception || typeof exception !== 'object') {
    return false;
  }
  const error = exception as { code?: number | string; details?: string; message?: string };
  const text = `${error.details ?? ''} ${error.message ?? ''}`;
  return error.code === 8 || /quota exceeded/i.test(text);
}
