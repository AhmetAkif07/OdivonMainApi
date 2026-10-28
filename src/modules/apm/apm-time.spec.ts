import { AppException } from '../../shared/errors/app.exception';
import { appointmentSlotIds, rangesOverlap, toUtcFromLocal } from './apm-time';

describe('APM appointment time helpers', () => {
  it('creates stable 15 minute lock ids for every occupied slot', () => {
    expect(appointmentSlotIds('staff-1', '2026-10-19T09:00:00.000Z', '2026-10-19T10:00:00.000Z')).toHaveLength(4);
    expect(appointmentSlotIds('staff-1', '2026-10-19T09:00:00.000Z', '2026-10-19T09:30:00.000Z'))
      .toEqual(appointmentSlotIds('staff-1', '2026-10-19T09:00:00.000Z', '2026-10-19T09:30:00.000Z'));
  });

  it('rejects values outside the atomic slot grid', () => {
    expect(() => appointmentSlotIds('staff-1', '2026-10-19T09:05:00.000Z', '2026-10-19T10:00:00.000Z'))
      .toThrow(AppException);
  });

  it('converts Istanbul wall clock values to UTC', () => {
    expect(toUtcFromLocal('2026-10-19', '12:00', 'Europe/Istanbul').toISOString()).toBe('2026-10-19T09:00:00.000Z');
  });

  it('allows adjacent appointments and detects real overlap', () => {
    expect(rangesOverlap('09:00', '10:00', '10:00', '11:00')).toBe(false);
    expect(rangesOverlap('09:00', '10:00', '09:45', '11:00')).toBe(true);
  });
});
