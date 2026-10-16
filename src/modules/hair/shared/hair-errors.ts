import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';

/** Hair endpoints return Turkish messages that the client shows to users as-is. */
export const hairNotFound = (message: string) => new AppException(ErrorCode.HAIR_NOT_FOUND, message);
export const hairInvalid = (message: string) => new AppException(ErrorCode.HAIR_INVALID, message);
export const hairPrecondition = (message: string) =>
  new AppException(ErrorCode.HAIR_PRECONDITION, message);
export const hairForbidden = (message: string) => new AppException(ErrorCode.HAIR_FORBIDDEN, message);

/**
 * 409 `HAS_RELATED_RECORDS` when any count is above zero: the record is still referenced, so the
 * client offers "deactivate" instead. `details.counts` lists only the non-zero relations.
 */
export function assertNoRelated(message: string, counts: Record<string, number>): void {
  const related = Object.fromEntries(Object.entries(counts).filter(([, count]) => count > 0));
  if (Object.keys(related).length > 0) {
    throw new AppException(ErrorCode.HAS_RELATED_RECORDS, message, { counts: related });
  }
}
