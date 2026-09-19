import { HttpException } from '@nestjs/common';
import { ErrorCode, errorHttpStatus } from './error-codes';

export class AppException extends HttpException {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super({ code, message }, errorHttpStatus[code]);
    this.code = code;
  }
}
