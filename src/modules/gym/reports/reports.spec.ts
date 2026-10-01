import { AccessEvent, churnByMonth, ChurnMember, hourlyOccupancy, lastMonths, localParts, occupancyNow } from './reports.math';

const at = (local: string) => new Date(`${local}+03:00`).toISOString(); // Istanbul wall clock
const entry = (userId: string | null, local: string, status = 'granted'): AccessEvent => ({ userId, direction: 'in', status, createdAt: at(local) });
const exit = (userId: string | null, local: string): AccessEvent => ({ userId, direction: 'out', status: 'granted', createdAt: at(local) });

describe('localParts', () => {
  it('uses the Istanbul day, weekday and hour', () => {
    // 2026-10-01 is a Thursday; 23:30 UTC on 30 Sep is 02:30 on 1 Oct in Istanbul.
    expect(localParts('2026-09-30T23:30:00.000Z')).toEqual({ day: '2026-10-01', weekday: 3, hour: 2 });
  });
});

describe('occupancyNow', () => {
  const now = new Date(at('2026-10-01T19:00:00'));

  it('counts people whose last event today is an entry when gates record exits', () => {
    const events = [
      entry('a', '2026-10-01T07:00:00'),
      exit('a', '2026-10-01T08:30:00'),
      entry('a', '2026-10-01T18:00:00'),
      entry('b', '2026-10-01T17:00:00'),
      exit('b', '2026-10-01T18:30:00'),
      entry('c', '2026-10-01T18:45:00', 'denied'),
    ];
    expect(occupancyNow(events, now)).toMatchObject({ inside: 1, todayEntries: 3, todayExits: 2, method: 'exits' });
  });

  it('estimates from recent entries when no exits are recorded', () => {
    const events = [entry('a', '2026-10-01T09:00:00'), entry('b', '2026-10-01T18:00:00'), entry('c', '2026-10-01T18:50:00'), entry('c', '2026-10-01T18:55:00')];
    expect(occupancyNow(events, now)).toMatchObject({ inside: 2, todayEntries: 4, method: 'estimate', stayMinutes: 90 });
  });

  it('is zero for an empty day (no sample numbers)', () => {
    expect(occupancyNow([], now)).toMatchObject({ inside: 0, todayEntries: 0 });
  });
});

describe('hourlyOccupancy', () => {
  it('averages entries per weekday and hour over the days in range', () => {
    // 2026-09-17 and 2026-09-24 are Thursdays; range covers two of each weekday.
    const events = [
      entry('a', '2026-09-17T18:10:00'),
      entry('b', '2026-09-17T18:40:00'),
      entry('c', '2026-09-24T18:05:00'),
      entry('d', '2026-09-24T07:00:00'),
      exit('a', '2026-09-17T19:30:00'),
      entry('x', '2026-08-01T18:00:00'),
    ];
    const r = hourlyOccupancy(events, '2026-09-14', '2026-09-27');
    expect(r.days).toBe(14);
    expect(r.totalEntries).toBe(4);
    expect(r.averages[3][18]).toBe(1.5);
    expect(r.averages[3][7]).toBe(0.5);
    expect(r.peak).toEqual({ weekday: 3, hour: 18, average: 1.5 });
    expect(r.hourly[18]).toBe(Math.round((3 / 14) * 10) / 10);
  });

  it('has no peak without data', () => {
    expect(hourlyOccupancy([], '2026-09-01', '2026-09-07').peak).toBeNull();
  });
});

describe('churnByMonth', () => {
  const m = (over: Partial<ChurnMember>): ChurnMember => ({
    uid: 'x',
    displayName: 'X',
    phone: null,
    packageLabel: 'Aylık',
    membershipStatus: 'active',
    membershipStartsAt: '2026-08-01T09:00:00.000Z',
    membershipEndsAt: '2026-09-01T09:00:00.000Z',
    createdAt: '2026-08-01T09:00:00.000Z',
    ...over,
  });

  it('counts memberships that ended in the month without renewal against those renewed', () => {
    const members = [
      m({ uid: 'churned', membershipEndsAt: '2026-09-10T09:00:00.000Z' }),
      m({ uid: 'renewed', membershipStartsAt: '2026-09-05T09:00:00.000Z', membershipEndsAt: '2026-10-05T09:00:00.000Z' }),
      m({ uid: 'new', createdAt: '2026-09-03T09:00:00.000Z', membershipStartsAt: '2026-09-03T09:00:00.000Z', membershipEndsAt: '2026-10-03T09:00:00.000Z' }),
      m({ uid: 'running', membershipEndsAt: '2026-12-01T09:00:00.000Z' }),
      m({ uid: 'frozen', membershipStatus: 'frozen', membershipEndsAt: '2026-09-12T09:00:00.000Z' }),
    ];
    const [sep] = churnByMonth(members, ['2026-09'], new Date('2026-10-01T08:00:00Z'));
    expect(sep).toMatchObject({ dueCount: 2, renewedCount: 1, churnedCount: 1, churnRate: 50 });
    expect(sep.churned.map((c) => c.uid)).toEqual(['churned']);
  });

  it('does not count a period that ends later this month as churn yet', () => {
    const [oct] = churnByMonth([m({ membershipEndsAt: '2026-10-20T09:00:00.000Z' })], ['2026-10'], new Date('2026-10-01T08:00:00Z'));
    expect(oct).toMatchObject({ dueCount: 0, churnRate: null });
  });

  it('lists the last months oldest first', () => {
    expect(lastMonths('2026-02-15', 3)).toEqual(['2025-12', '2026-01', '2026-02']);
  });
});
