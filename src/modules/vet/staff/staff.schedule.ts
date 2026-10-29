import { StaffShift } from './staff.entity';

const DAY_MS = 24 * 60 * 60 * 1000;

export function toDay(value: string): string {
  return value.slice(0, 10);
}

/** Every YYYY-MM-DD from `from` to `to`, both included. */
export function eachDay(from: string, to: string): string[] {
  const days: string[] = [];
  for (let time = Date.parse(`${toDay(from)}T00:00:00Z`); time <= Date.parse(`${toDay(to)}T00:00:00Z`); time += DAY_MS) {
    days.push(new Date(time).toISOString().slice(0, 10));
  }
  return days;
}

/** Leave days in an inclusive range, not counting Sundays. */
export function countLeaveDays(from: string, to: string): number {
  return eachDay(from, to).filter((value) => new Date(`${value}T00:00:00Z`).getUTCDay() !== 0).length;
}

/** Shift as [start, end) in epoch minutes; an end at or before the start rolls into the next day. */
export function shiftWindow(shift: Pick<StaffShift, 'date' | 'startTime' | 'endTime'>): [number, number] {
  const base = Date.parse(`${toDay(shift.date)}T00:00:00Z`) / 60000;
  const minutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
  const start = base + minutes(shift.startTime);
  let end = base + minutes(shift.endTime);
  if (end <= start) {
    end += 24 * 60;
  }
  return [start, end];
}

export function shiftsOverlap(
  left: Pick<StaffShift, 'date' | 'startTime' | 'endTime'>,
  right: Pick<StaffShift, 'date' | 'startTime' | 'endTime'>,
): boolean {
  const [a1, a2] = shiftWindow(left);
  const [b1, b2] = shiftWindow(right);
  return a1 < b2 && b1 < a2;
}
