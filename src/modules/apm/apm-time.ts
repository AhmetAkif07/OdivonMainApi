import { AppException } from '../../shared/errors/app.exception';
import { ErrorCode } from '../../shared/errors/error-codes';

export const APM_SLOT_MINUTES = 15;
const SLOT_MS = APM_SLOT_MINUTES * 60_000;

export function toUtcFromLocal(date: string, time: string, timeZone: string): Date {
  const base = new Date(`${date}T${time}:00.000Z`);
  if (Number.isNaN(base.getTime())) invalid('Tarih veya saat geçersiz.');
  let result = base;
  for (let i = 0; i < 2; i += 1) {
    const parts = partsInTimeZone(result, timeZone);
    const represented = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
    result = new Date(result.getTime() - (represented - base.getTime()));
  }
  const check = partsInTimeZone(result, timeZone);
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  if (check.year !== year || check.month !== month || check.day !== day || check.hour !== hour || check.minute !== minute) {
    invalid('Seçilen yerel saat bu zaman diliminde geçerli değil.');
  }
  return result;
}

export function isoWeekday(date: string): number {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

export function clock(date: Date, timeZone: string): string {
  const parts = partsInTimeZone(date, timeZone);
  return `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
}

export function appointmentSlotIds(staffId: string, startAt: string, endAt: string): string[] {
  const start = Date.parse(startAt);
  const end = Date.parse(endAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) invalid('Randevu zamanı geçersiz.');
  if (start % SLOT_MS !== 0 || end % SLOT_MS !== 0) invalid('Randevu saatleri 15 dakikalık aralıklara uymalı.');
  const ids: string[] = [];
  for (let cursor = start; cursor < end; cursor += SLOT_MS) {
    ids.push(`${staffId}_${Math.floor(cursor / SLOT_MS)}`);
    if (ids.length > 32) invalid('Bir randevu en fazla 8 saat sürebilir.');
  }
  return ids;
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

export function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && aEnd > bStart;
}

function partsInTimeZone(date: Date, timeZone: string) {
  let entries: Intl.DateTimeFormatPart[];
  try {
    entries = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(date);
  } catch {
    invalid('Şube zaman dilimi geçersiz.');
  }
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(entries.find((entry) => entry.type === type)?.value);
  return { year: value('year'), month: value('month'), day: value('day'), hour: value('hour'), minute: value('minute') };
}

function invalid(message: string): never { throw new AppException(ErrorCode.APPOINTMENT_INVALID, message); }
