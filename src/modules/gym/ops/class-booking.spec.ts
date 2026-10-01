import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { GymMember } from '../members/member.entity';
import { applyPackage } from '../shared/membership';
import { GymPackage } from '../packages/package.entity';
import { creditsLeft, isTimelyCancel, nextSessionDate, sessionStart, weekdayOf } from './class-booking.math';
import { ClassBooking, GymClassBookingService } from './class-booking.service';

describe('class session dates (Istanbul)', () => {
  it('finds the next occurrence of a weekly slot that has not started', () => {
    // Thursday 1 Oct 2026, 17:00 in Istanbul.
    const now = new Date('2026-10-01T14:00:00Z');
    expect(weekdayOf('2026-10-01')).toBe(4);
    expect(nextSessionDate(4, '18:00', now)).toBe('2026-10-01'); // later today
    expect(nextSessionDate(4, '09:00', now)).toBe('2026-10-08'); // already started, next week
    expect(nextSessionDate(1, '09:00', now)).toBe('2026-10-05'); // Monday
    expect(sessionStart('2026-10-01', '18:00').toISOString()).toBe('2026-10-01T15:00:00.000Z');
  });

  it('treats cancelling 2 hours or more before the start as on time', () => {
    expect(isTimelyCancel('2026-10-01', '18:00', new Date('2026-10-01T13:00:00Z'))).toBe(true);
    expect(isTimelyCancel('2026-10-01', '18:00', new Date('2026-10-01T13:30:00Z'))).toBe(false);
  });

  it('gives package credits per period, unlimited when the package has none', () => {
    const base = { classCredits: 8, durationDays: 30, name: 'P' } as GymPackage;
    const member = { membershipStatus: 'expired', membershipEndsAt: null, classCreditsUsed: 5 } as unknown as GymMember;
    expect(applyPackage(member, base, 100)).toMatchObject({ classCreditsTotal: 8, classCreditsUsed: 0 });
    expect(applyPackage(member, { ...base, classCredits: null }, 100)).toMatchObject({ classCreditsTotal: null });
    expect(creditsLeft({ classCreditsTotal: 8, classCreditsUsed: 8 })).toBe(0);
    expect(creditsLeft({ classCreditsTotal: null })).toBeNull();
  });
});

describe('GymClassBookingService', () => {
  type Row = Record<string, unknown> & { id: string; createdAt: string };
  let seq = 0;
  let tables: Record<string, Map<string, Row>>;
  let members: Map<string, GymMember>;
  let service: GymClassBookingService;

  const table = (name: string) => (tables[name] ??= new Map());
  const store = {
    userId: () => 'staff-1',
    list: async (name: string) => [...table(name).values()].filter((r) => !r['deletedAt']),
    create: async (name: string, fields: object) => {
      const row = { id: `r${++seq}`, createdAt: new Date(Date.UTC(2026, 9, 1, 0, 0, seq)).toISOString(), deletedAt: null, ...fields } as Row;
      table(name).set(row.id, row);
      return row;
    },
    getOrThrow: async (name: string, id: string, code: string, message: string) => {
      const row = table(name).get(id);
      if (!row || row['deletedAt']) throw new AppException(code as ErrorCode, message);
      return row;
    },
    update: async (name: string, id: string, _c: string, _m: string, patch: object) => {
      const next = { ...table(name).get(id)!, ...patch } as Row;
      table(name).set(id, next);
      return next;
    },
    save: async (name: string, row: Row) => (table(name).set(row.id, row), row),
    softDelete: async (name: string, id: string) => {
      table(name).set(id, { ...table(name).get(id)!, deletedAt: 'x' });
      return { id };
    },
  };
  const membersRepo = {
    getByIdOrThrow: async (id: string) => {
      const m = members.get(id);
      if (!m) throw new AppException(ErrorCode.GYM_MEMBER_NOT_FOUND, 'Member not found');
      return m;
    },
    save: async (m: GymMember) => (members.set(m.uid, m), m),
  };
  const member = (uid: string, over: Partial<GymMember> = {}) =>
    members.set(uid, { uid, displayName: uid.toUpperCase(), classCreditsTotal: null, classCreditsUsed: 0, noShowCount: 0, ...over } as GymMember);

  // A Monday 19:00 class with 2 places; "now" for the tests is in the week before.
  const MONDAY = '2026-10-05';

  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-10-01T09:00:00Z'), doNotFake: ['nextTick', 'setImmediate'] });
    seq = 0;
    tables = {};
    members = new Map();
    table('gymClassSchedules').set('c1', { id: 'c1', createdAt: 'x', name: 'Pilates', dayOfWeek: 1, startTime: '19:00', capacity: 2, status: 'active' });
    service = new GymClassBookingService(store as never, membersRepo as never);
  });
  afterEach(() => jest.useRealTimers());

  async function expectCode(promise: Promise<unknown>, code: string) {
    await expect(promise).rejects.toBeInstanceOf(AppException);
    await promise.catch((e: AppException) => expect(e.code).toBe(code));
  }

  it('books the next session, reserves a credit and enforces capacity per session', async () => {
    member('a', { classCreditsTotal: 4 });
    member('b');
    member('c');
    const a = await service.book({ scheduleId: 'c1', userId: 'a' });
    expect(a).toMatchObject({ sessionDate: MONDAY, attendanceStatus: 'booked', creditReserved: true, memberName: 'A' });
    expect(members.get('a')!.classCreditsUsed).toBe(1);
    expect(await service.book({ scheduleId: 'c1', userId: 'a' })).toMatchObject({ id: a.id }); // no double booking
    await service.book({ scheduleId: 'c1', userId: 'b' });
    await expectCode(service.book({ scheduleId: 'c1', userId: 'c' }), ErrorCode.GYM_CLASS_FULL);
    // the following week is a different session with its own places
    expect(await service.book({ scheduleId: 'c1', userId: 'c', sessionDate: '2026-10-12' })).toMatchObject({ sessionDate: '2026-10-12' });
    expect(table('gymClassSchedules').get('c1')!['currentBookings']).toBe(2);
  });

  it('refuses a booking without credits left and dates the class does not run', async () => {
    member('a', { classCreditsTotal: 2, classCreditsUsed: 2 });
    await expectCode(service.book({ scheduleId: 'c1', userId: 'a' }), ErrorCode.GYM_CLASS_NO_CREDIT);
    member('b');
    await expectCode(service.book({ scheduleId: 'c1', userId: 'b', sessionDate: '2026-10-06' }), ErrorCode.VALIDATION_ERROR);
  });

  it('refunds the credit on time, keeps it on a late cancel', async () => {
    member('a', { classCreditsTotal: 4 });
    const early = await service.book({ scheduleId: 'c1', userId: 'a' });
    await service.cancel(early.id, { byStaff: false, userId: 'a' });
    expect(members.get('a')!.classCreditsUsed).toBe(0);

    const late = await service.book({ scheduleId: 'c1', userId: 'a' });
    jest.setSystemTime(new Date('2026-10-05T15:30:00Z')); // 18:30 Istanbul, 30 min before
    const cancelled = await service.cancel(late.id, { byStaff: false, userId: 'a' });
    expect(cancelled).toMatchObject({ attendanceStatus: 'cancelled', lateCancel: true });
    expect(members.get('a')!.classCreditsUsed).toBe(1);
  });

  it('only lets members cancel their own booking', async () => {
    member('a');
    const booking = await service.book({ scheduleId: 'c1', userId: 'a' });
    await expectCode(service.cancel(booking.id, { byStaff: false, userId: 'b' }), ErrorCode.GYM_BOOKING_NOT_FOUND);
  });

  it('promotes the waitlist in order on a cancellation, skipping members without credits', async () => {
    member('a');
    member('b');
    member('noCredit', { classCreditsTotal: 1, classCreditsUsed: 1 });
    member('w2');
    const a = await service.book({ scheduleId: 'c1', userId: 'a' });
    await service.book({ scheduleId: 'c1', userId: 'b' });
    expect(await service.joinWaitlist({ scheduleId: 'c1', userId: 'noCredit' })).toMatchObject({ position: 1 });
    expect(await service.joinWaitlist({ scheduleId: 'c1', userId: 'w2' })).toMatchObject({ position: 2 });
    await expectCode(service.joinWaitlist({ scheduleId: 'c1', userId: 'w2' }), ErrorCode.GYM_WAITLIST_EXISTS);

    await service.cancel(a.id, { byStaff: true });
    const roster = await service.roster('c1', MONDAY);
    expect(roster.bookings.filter((x) => x.attendanceStatus === 'booked').map((x) => x.userId).sort()).toEqual(['b', 'w2']);
    expect(roster.waitlist.map((w) => w.userId)).toEqual(['noCredit']);
    expect([...table('gymMemberNotifications').values()].map((n) => n['userId'])).toEqual(['w2']);
  });

  it('records attendance and counts no-shows (also when closed automatically)', async () => {
    member('a');
    member('b');
    const a = await service.book({ scheduleId: 'c1', userId: 'a' });
    const b = await service.book({ scheduleId: 'c1', userId: 'b' });
    await service.markAttendance('c1', MONDAY, [
      { bookingId: a.id, status: 'checked-in' },
      { bookingId: b.id, status: 'no-show' },
    ]);
    expect(members.get('b')!.noShowCount).toBe(1);
    await service.markAttendance('c1', MONDAY, [{ bookingId: b.id, status: 'checked-in' }]); // corrected
    expect(members.get('b')!.noShowCount).toBe(0);

    member('c');
    const c = await service.book({ scheduleId: 'c1', userId: 'c', sessionDate: '2026-10-12' });
    expect(await service.closePastSessions('2026-10-13')).toBe(1);
    expect((table('gymClassBookings').get(c.id) as unknown as ClassBooking).attendanceStatus).toBe('no-show');
    expect(members.get('c')!.noShowCount).toBe(1);
    expect(await service.closePastSessions('2026-10-13')).toBe(0);
  });
});
