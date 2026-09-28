import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';

/** Farm endpoints send Turkish messages the OdivonFARM client shows to users as-is. */
export const farmNotFound = (message: string) =>
  new AppException(ErrorCode.FARM_NOT_FOUND, message);
export const farmInvalid = (message: string) => new AppException(ErrorCode.FARM_INVALID, message);
export const farmPrecondition = (message: string) =>
  new AppException(ErrorCode.FARM_PRECONDITION, message);
export const farmForbidden = (message: string) =>
  new AppException(ErrorCode.FARM_FORBIDDEN, message);
