import { HttpException } from '@nestjs/common';
import { ErrorCode, errorHttpStatus } from './error-codes';

export class AppException extends HttpException {
  readonly code: ErrorCode;
  /** Machine-readable extras the client may act on (e.g. related record counts). */
  readonly details?: Record<string, unknown>;

  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>) {
    super({ code, message, ...(details ? { details } : {}) }, errorHttpStatus[code]);
    this.code = code;
    this.details = details;
  }
}
