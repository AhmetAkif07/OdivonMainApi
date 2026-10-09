import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';

/** Hair endpoints return Turkish messages that the client shows to users as-is. */
export const hairNotFound = (message: string) => new AppException(ErrorCode.HAIR_NOT_FOUND, message);
export const hairInvalid = (message: string) => new AppException(ErrorCode.HAIR_INVALID, message);
export const hairPrecondition = (message: string) =>
  new AppException(ErrorCode.HAIR_PRECONDITION, message);
export const hairForbidden = (message: string) => new AppException(ErrorCode.HAIR_FORBIDDEN, message);
