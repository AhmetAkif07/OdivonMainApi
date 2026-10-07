import {
  branchHoursViolation,
  busyBlocks,
  canTransition,
  findConflict,
  localInstant,
  planLines,
  ServiceSpec,
  staffAvailabilityViolation,
  toClock,
  weekday,
} from './appointment-plan';

const cut: ServiceSpec = { id: 'cut', name: 'Kesim', durationMinutes: 30, price: 300 };
const color: ServiceSpec = { id: 'color', name: 'Boya', durationMinutes: 90, processingMinutes: 40, price: 1200 };

describe('appointment-plan (plan §8.1)', () => {
  it('lays services back to back and sums duration and price (R-003)', () => {
    const plan = planLines([color, cut], ['st1', 'st2']);
    expect(plan.totalDurationMinutes).toBe(120);
    expect(plan.totalPrice).toBe(1500);
    expect(plan.lines.map((l) => [l.serviceId, l.staffId, l.startOffsetMinutes])).toEqual([
      ['color', 'st1', 0],
      ['cut', 'st2', 90],
    ]);
  });

  it('refuses a staff member the service is not open to', () => {
    expect(() => planLines([{ ...cut, staffIds: ['st9'] }], ['st1'])).toThrow();
  });

  it('frees the stylist during processing time (R-012)', () => {
    expect(busyBlocks(600, planLines([color], ['st1']).lines, 'st1')).toEqual([{ staffId: 'st1', start: 600, end: 650 }]);
  });

  it('detects overlaps per staff member and ignores closed appointments (R-001/R-002)', () => {
    const existing = [
      { id: 'a', staffId: 'st1', startTime: '10:00', status: 'confirmed', services: [{ staffId: 'st1', startOffsetMinutes: 0, durationMinutes: 60 }] },
      { id: 'b', staffId: 'st2', startTime: '10:00', status: 'cancelled', services: [{ staffId: 'st2', startOffsetMinutes: 0, durationMinutes: 60 }] },
    ];
    expect(findConflict([{ staffId: 'st1', start: 630, end: 660 }], existing)).toBe('st1');
    expect(findConflict([{ staffId: 'st1', start: 660, end: 690 }], existing)).toBeNull(); // touching is fine
    expect(findConflict([{ staffId: 'st2', start: 600, end: 660 }], existing)).toBeNull(); // cancelled
  });

  it('lets another client in during an existing colour processing window (R-012)', () => {
    const existing = [
      { id: 'a', staffId: 'st1', startTime: '10:00', status: 'confirmed', services: [{ staffId: 'st1', durationMinutes: 90, processingMinutes: 40 }] },
    ];
    expect(findConflict([{ staffId: 'st1', start: 650, end: 680 }], existing)).toBeNull();
    expect(findConflict([{ staffId: 'st1', start: 640, end: 670 }], existing)).toBe('st1');
  });

  it('checks a multi-staff appointment line by line (R-013)', () => {
    const existing = [
      { id: 'a', staffId: 'st1', startTime: '10:00', status: 'confirmed', services: [{ staffId: 'st2', startOffsetMinutes: 30, durationMinutes: 30 }] },
    ];
    expect(findConflict([{ staffId: 'st1', start: 630, end: 660 }], existing)).toBeNull();
    expect(findConflict([{ staffId: 'st2', start: 630, end: 660 }], existing)).toBe('st2');
  });

  it('respects staff schedule, shifts and approved leave (R-004)', () => {
    const availability = {
      name: 'Ayşe',
      workSchedule: [{ dayOfWeek: 4, startTime: '09:00', endTime: '17:00' }],
      shifts: [],
      timeOff: [{ startDate: '2026-10-20', endDate: '2026-10-22' }],
    };
    // 2026-10-08 is a Thursday (4)
    expect(staffAvailabilityViolation([{ staffId: 's', start: 600, end: 660 }], '2026-10-08', availability)).toBeNull();
    expect(staffAvailabilityViolation([{ staffId: 's', start: 990, end: 1050 }], '2026-10-08', availability)).toMatch(/çalışmıyor/);
    expect(
      staffAvailabilityViolation([{ staffId: 's', start: 990, end: 1050 }], '2026-10-08', {
        ...availability,
        shifts: [{ startTime: '16:00', endTime: '20:00' }],
      }),
    ).toBeNull();
    expect(staffAvailabilityViolation([{ staffId: 's', start: 600, end: 660 }], '2026-10-21', availability)).toMatch(/izinli/);
    expect(
      staffAvailabilityViolation([{ staffId: 's', start: 0, end: 30 }], '2026-10-08', { ...availability, workSchedule: [] }),
    ).toBeNull();
  });

  it('respects branch working days and hours (R-005)', () => {
    const branch = { name: 'Moda', workDayStart: '09:00', workDayEnd: '21:00', workDays: [1, 2, 3, 4, 5, 6] };
    expect(branchHoursViolation('2026-10-08', 540, 600, branch)).toBeNull();
    expect(branchHoursViolation('2026-10-08', 1230, 1270, branch)).toMatch(/çalışma saatleri/);
    expect(branchHoursViolation('2026-10-11', 600, 660, branch)).toMatch(/kapalı/); // Sunday
  });

  it('allows only sensible status transitions', () => {
    expect(canTransition('pending', 'confirmed')).toBe(true);
    expect(canTransition('confirmed', 'checkedIn')).toBe(true);
    expect(canTransition('completed', 'cancelled')).toBe(false);
    expect(canTransition('cancelled', 'confirmed')).toBe(false);
    expect(canTransition('inProgress', 'noShow')).toBe(false);
  });

  it('converts local wall-clock times to UTC instants', () => {
    expect(localInstant('2026-10-08', 14 * 60, 'Europe/Istanbul').toISOString()).toBe('2026-10-08T11:00:00.000Z');
    expect(toClock(905)).toBe('15:05');
    expect(weekday('2026-10-08')).toBe(4);
  });
});
