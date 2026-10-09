import { hairInvalid, hairPrecondition } from './hair-errors';
import { round2 } from './hair-money';
import { dayBoundsInTz, parseClock } from './hair-time';

/** Pure scheduling math for appointments (plan §8.1); minutes are minutes since local midnight. */

export const APPOINTMENT_STATUSES = [
  'pending',
  'confirmed',
  'checkedIn',
  'inProgress',
  'completed',
  'cancelled',
  'noShow',
] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

/** Statuses that hold the staff member's time and can still be edited or checked out. */
export const OPEN_APPOINTMENT_STATUSES: readonly AppointmentStatus[] = [
  'pending',
  'confirmed',
  'checkedIn',
  'inProgress',
];

/** Allowed manual transitions (`completed` is normally set by POS checkout, P-006). */
export const STATUS_TRANSITIONS: Record<AppointmentStatus, readonly AppointmentStatus[]> = {
  pending: ['confirmed', 'checkedIn', 'cancelled', 'noShow'],
  confirmed: ['pending', 'checkedIn', 'inProgress', 'completed', 'cancelled', 'noShow'],
  checkedIn: ['inProgress', 'completed', 'cancelled', 'noShow'],
  inProgress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
  noShow: [],
};

export function canTransition(from: AppointmentStatus, to: AppointmentStatus): boolean {
  return STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

export function isOpenStatus(status: unknown): boolean {
  return OPEN_APPOINTMENT_STATUSES.includes(status as AppointmentStatus);
}

export interface ServiceSpec {
  id: string;
  name: string;
  durationMinutes: number;
  processingMinutes?: number;
  price: number;
  depositAmount?: number;
  staffIds?: string[];
}

export interface PlannedLine {
  serviceId: string;
  serviceName: string;
  staffId: string;
  startOffsetMinutes: number;
  durationMinutes: number;
  processingMinutes?: number;
  price: number;
}

export interface Plan {
  lines: PlannedLine[];
  totalDurationMinutes: number;
  totalPrice: number;
  depositAmount: number;
}

/** Lines run back to back in the given order (R-003); each line may name its own staff (R-013). */
export function planLines(services: ServiceSpec[], staffIds: string[]): Plan {
  if (services.length === 0) throw hairInvalid('En az bir hizmet seçilmelidir.');
  let offset = 0;
  let totalPrice = 0;
  let depositAmount = 0;
  const lines = services.map((service, index) => {
    const staffId = staffIds[index];
    if (service.staffIds?.length && !service.staffIds.includes(staffId)) {
      throw hairPrecondition(`"${service.name}" hizmetini seçilen personel yapamıyor.`);
    }
    const line: PlannedLine = {
      serviceId: service.id,
      serviceName: service.name,
      staffId,
      startOffsetMinutes: offset,
      durationMinutes: service.durationMinutes,
      ...(service.processingMinutes ? { processingMinutes: service.processingMinutes } : {}),
      price: service.price,
    };
    offset += service.durationMinutes;
    totalPrice += service.price;
    depositAmount += service.depositAmount ?? 0;
    return line;
  });
  return {
    lines,
    totalDurationMinutes: offset,
    totalPrice: round2(totalPrice),
    depositAmount: round2(depositAmount),
  };
}

export interface Block {
  staffId: string;
  start: number;
  end: number;
}

interface LineLike {
  staffId?: string;
  startOffsetMinutes?: number;
  durationMinutes?: number;
  processingMinutes?: number;
}

/**
 * Minutes during which each staff member is actually busy. R-012: a line's `processingMinutes`
 * (e.g. colour developing) is modelled as the tail of the line, so the stylist is free for another
 * client then. Lines without an explicit staff id fall back to the appointment's primary staff.
 */
export function busyBlocks(startMinutes: number, lines: LineLike[], fallbackStaffId: string): Block[] {
  return lines
    .map((line) => {
      const start = startMinutes + (line.startOffsetMinutes ?? 0);
      const active = Math.max(0, (line.durationMinutes ?? 0) - (line.processingMinutes ?? 0));
      return { staffId: line.staffId || fallbackStaffId, start, end: start + active };
    })
    .filter((block) => block.end > block.start);
}

/** Whole span of every line per staff (used for working-hours checks, processing time included). */
export function lineSpans(startMinutes: number, lines: LineLike[], fallbackStaffId: string): Block[] {
  return lines.map((line) => {
    const start = startMinutes + (line.startOffsetMinutes ?? 0);
    return {
      staffId: line.staffId || fallbackStaffId,
      start,
      end: start + (line.durationMinutes ?? 0),
    };
  });
}

export interface ExistingAppointment {
  id: string;
  staffId: string;
  startTime: string;
  status: string;
  services?: LineLike[];
}

/** First staff id whose busy time overlaps an open appointment (R-001/R-002), else null. */
export function findConflict(blocks: Block[], existing: ExistingAppointment[]): string | null {
  for (const other of existing) {
    if (!isOpenStatus(other.status)) continue;
    const start = parseClock(other.startTime);
    if (start === undefined) continue;
    const otherBlocks = busyBlocks(start, other.services ?? [], other.staffId);
    for (const mine of blocks) {
      if (
        otherBlocks.some((b) => b.staffId === mine.staffId && mine.start < b.end && b.start < mine.end)
      ) {
        return mine.staffId;
      }
    }
  }
  return null;
}

export interface WorkWindow {
  startTime: string;
  endTime: string;
}

export interface StaffAvailability {
  name: string;
  /** Weekly template; `dayOfWeek` 0 = Sunday. */
  workSchedule: (WorkWindow & { dayOfWeek: number })[];
  /** Extra shifts on the day (and branch) in question. */
  shifts: WorkWindow[];
  /** Approved leave records. */
  timeOff: { startDate: string; endDate: string }[];
}

/**
 * Null when every span fits the staff member's working time that day (R-004), else a reason. A staff
 * member with neither a weekly schedule nor shifts is treated as always available.
 */
export function staffAvailabilityViolation(
  spans: Block[],
  date: string,
  availability: StaffAvailability,
): string | null {
  if (availability.timeOff.some((leave) => leave.startDate <= date && date <= leave.endDate)) {
    return `${availability.name} bu tarihte izinli.`;
  }
  const dayOfWeek = weekday(date);
  const windows = [
    ...availability.workSchedule.filter((w) => w.dayOfWeek === dayOfWeek),
    ...availability.shifts,
  ]
    .map((w) => ({ start: parseClock(w.startTime), end: parseClock(w.endTime) }))
    .filter((w): w is { start: number; end: number } => w.start !== undefined && w.end !== undefined);
  if (availability.workSchedule.length === 0 && availability.shifts.length === 0) return null;
  const fits = spans.every((span) => windows.some((w) => w.start <= span.start && span.end <= w.end));
  return fits ? null : `${availability.name} bu saatte çalışmıyor.`;
}

export interface BranchHours {
  name: string;
  workDayStart?: string;
  workDayEnd?: string;
  workDays?: number[];
}

/** Null when [start, end) is inside the branch's working day and hours (R-005), else a reason. */
export function branchHoursViolation(
  date: string,
  start: number,
  end: number,
  branch: BranchHours,
): string | null {
  if (branch.workDays?.length && !branch.workDays.includes(weekday(date))) {
    return `${branch.name} bu gün kapalı.`;
  }
  const open = parseClock(branch.workDayStart);
  const close = parseClock(branch.workDayEnd);
  if (open !== undefined && close !== undefined && (start < open || end > close)) {
    return `Randevu şube çalışma saatleri (${branch.workDayStart}–${branch.workDayEnd}) dışında kalıyor.`;
  }
  if (end > 24 * 60) return 'Randevu gün sonunu aşamaz.';
  return null;
}

/** 0 = Sunday for a `YYYY-MM-DD` calendar date. */
export function weekday(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function toClock(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * UTC instant of a local wall-clock time. Uses the offset at local midnight, which is exact for
 * zones without daylight saving (Europe/Istanbul) and off by the DST shift only on transition days.
 */
export function localInstant(date: string, minutes: number, timeZone: string): Date {
  return new Date(dayBoundsInTz(date, timeZone).start.getTime() + minutes * 60_000);
}

/** Adds whole days to a `YYYY-MM-DD` date. */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
