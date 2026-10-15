import { AppException } from '../../shared/errors/app.exception';
import { ErrorCode } from '../../shared/errors/error-codes';
import { SlotEntry } from './rentacar.types';

const DAY_MS = 86_400_000;
const MAX_RESERVATION_DAYS = 180;

export function reservationDayKeys(vehicleId: string, startAt: string, endAt: string): string[] {
  const start = Date.parse(startAt);
  const end = Date.parse(endAt);
  if (!vehicleId || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    throw new AppException(ErrorCode.RENT_INVALID, 'Geçersiz araç veya rezervasyon tarih aralığı.');
  }
  const first = Date.UTC(new Date(start).getUTCFullYear(), new Date(start).getUTCMonth(), new Date(start).getUTCDate());
  const last = Date.UTC(new Date(end - 1).getUTCFullYear(), new Date(end - 1).getUTCMonth(), new Date(end - 1).getUTCDate());
  const days = Math.floor((last - first) / DAY_MS) + 1;
  if (days > MAX_RESERVATION_DAYS) {
    throw new AppException(ErrorCode.RENT_INVALID, `Rezervasyon en fazla ${MAX_RESERVATION_DAYS} gün olabilir.`);
  }
  return Array.from({ length: days }, (_, index) =>
    `${vehicleId}_${new Date(first + index * DAY_MS).toISOString().slice(0, 10)}`,
  );
}

export function rangesOverlap(leftStart: string, leftEnd: string, rightStart: string, rightEnd: string): boolean {
  return Date.parse(leftStart) < Date.parse(rightEnd) && Date.parse(rightStart) < Date.parse(leftEnd);
}

export function assertNoReservationConflict(entries: SlotEntry[], candidate: SlotEntry): void {
  const conflict = entries.some((entry) =>
    entry.reservationId !== candidate.reservationId &&
    rangesOverlap(entry.startAt, entry.endAt, candidate.startAt, candidate.endAt),
  );
  if (conflict) {
    throw new AppException(ErrorCode.RENT_CONFLICT, 'Araç seçilen tarih aralığında müsait değil.');
  }
}
