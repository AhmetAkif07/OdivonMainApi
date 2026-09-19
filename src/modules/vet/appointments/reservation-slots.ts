import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';

export const SLOT_MS = 60_000;
export const MAX_APPOINTMENT_MINUTES = 480;

export function reservationSlotIds(doctorId: string, beginAt: Date, endAt: Date): string[] {
  if (!(beginAt instanceof Date) || Number.isNaN(beginAt.getTime())) {
    throw new AppException(ErrorCode.APPOINTMENT_INVALID, 'beginAt is invalid');
  }
  if (!(endAt instanceof Date) || Number.isNaN(endAt.getTime())) {
    throw new AppException(ErrorCode.APPOINTMENT_INVALID, 'endAt is invalid');
  }
  if (endAt <= beginAt) {
    throw new AppException(ErrorCode.APPOINTMENT_INVALID, 'endAt must be after beginAt');
  }

  const beginMinute = Math.floor(beginAt.getTime() / SLOT_MS);
  const ids: string[] = [];
  for (let minute = beginMinute; minute * SLOT_MS < endAt.getTime(); minute += 1) {
    ids.push(slotDocumentId(doctorId, minute));
    if (ids.length > MAX_APPOINTMENT_MINUTES) {
      throw new AppException(ErrorCode.APPOINTMENT_INVALID, 'Appointment duration exceeds maximum');
    }
  }
  return ids;
}

export function slotDocumentId(doctorId: string, epochMinute: number): string {
  return `${doctorId}_${epochMinute}`;
}

export function rangesOverlap(aBegin: Date, aEnd: Date, bBegin: Date, bEnd: Date): boolean {
  return aBegin < bEnd && aEnd > bBegin;
}

export function isAlreadyExistsError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const code = (error as { code?: unknown }).code;
  return code === 6 || code === 'already-exists' || code === 'ALREADY_EXISTS';
}
