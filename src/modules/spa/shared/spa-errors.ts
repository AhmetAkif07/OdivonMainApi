import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';

/** Spa endpoints keep the Turkish messages the SPA client already shows to users. */
export const spaNotFound = (message: string) => new AppException(ErrorCode.SPA_NOT_FOUND, message);
export const spaInvalid = (message: string) => new AppException(ErrorCode.SPA_INVALID, message);
export const spaPrecondition = (message: string) =>
  new AppException(ErrorCode.SPA_PRECONDITION, message);
export const spaForbidden = (message: string) => new AppException(ErrorCode.SPA_FORBIDDEN, message);
