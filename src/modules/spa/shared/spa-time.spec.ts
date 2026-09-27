import assert from 'node:assert/strict';
import { dateIdInTz, localClockInTz, parseClock, workHoursViolation } from './spa-time';

const schedule = { timeZone: 'Europe/Istanbul', workDayStart: '09:00', workDayEnd: '21:00' };
const istanbul = (h: number, m = 0) => new Date(Date.UTC(2030, 0, 1, h - 3, m)); // UTC+3

test('localClockInTz reads the tenant-local clock', () => {
  assert.deepEqual(localClockInTz(istanbul(9, 30), 'Europe/Istanbul'), {
    dateId: '2030-01-01',
    minutes: 570,
  });
});

test('parseClock accepts HH:MM only', () => {
  assert.equal(parseClock('09:00'), 540);
  assert.equal(parseClock('21:30'), 1290);
  assert.equal(parseClock('9'), undefined);
  assert.equal(parseClock(undefined), undefined);
});

test('workHoursViolation allows bookings that fit, including one ending exactly at closing', () => {
  assert.equal(workHoursViolation(istanbul(9), istanbul(10), schedule), null);
  assert.equal(workHoursViolation(istanbul(20), istanbul(21), schedule), null);
});

test('workHoursViolation rejects bookings before opening, after closing or past midnight', () => {
  assert.ok(workHoursViolation(istanbul(8, 30), istanbul(9, 30), schedule));
  assert.ok(workHoursViolation(istanbul(20, 30), istanbul(21, 30), schedule));
  assert.ok(workHoursViolation(istanbul(23), istanbul(25), { ...schedule, workDayEnd: '24:00' }));
});

test('workHoursViolation is skipped when the tenant has no working hours set', () => {
  assert.equal(workHoursViolation(istanbul(3), istanbul(4), { timeZone: 'Europe/Istanbul' }), null);
});

test('dateIdInTz uses the tenant-local calendar day', () => {
  // 22:30 UTC on the 27th is already the 28th in Istanbul (UTC+3).
  const instant = new Date(Date.UTC(2026, 8, 27, 22, 30));
  assert.equal(dateIdInTz('Europe/Istanbul', instant), '2026-09-28');
  assert.equal(dateIdInTz('UTC', instant), '2026-09-27');
});
