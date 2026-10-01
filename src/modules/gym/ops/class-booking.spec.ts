import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { TenantContext } from '../../../shared/tenancy/tenant.context';
import { FakeFirestore } from '../../../shared/testing/fake-firestore';
import { GymMember } from '../members/member.entity';
import { MembersRepository } from '../members/members.repository';
import { applyPackage } from '../shared/membership';
import { GymStore } from '../shared/gym-store';
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

describe('GymClassBookingService (Firestore transactions)', () => {
  let db: FakeFirestore;
  let service: GymClassBookingService;
  let as: <T>(fn: () => Promise<T>) => Promise<T>;

  const path = (collection: string, id = '') => `tenants/t1/${collection}${id ? `/${id}` : ''}`;
  const rows = (collection: string) =>
    [...db.docs.entries()].filter(([key]) => key.startsWith(`${path(collection)}/`)).map(([, value]) => value);
  const member = (uid: string, over: Partial<GymMember> = {}) =>
    db.docs.set(path('gymMembers', uid), {
      uid,
      displayName: uid.toUpperCase(),
      classCreditsTotal: null,
      classCreditsUsed: 0,
      noShowCount: 0,
      deletedAt: null,
      ...over,
    });
  const memberDoc = (uid: string) => db.docs.get(path('gymMembers', uid)) as unknown as GymMember;
  const booking = (id: string) => db.docs.get(path('gymClassBookings', id)) as unknown as ClassBooking;
  const booked = (bookings: ClassBooking[]) =>
    bookings
      .filter((x) => x.attendanceStatus === 'booked')
      .map((x) => x.userId)
      .sort();

  // A Monday 19:00 class with 2 places; "now" for the tests is in the week before.
  const MONDAY = '2026-10-05';

  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-10-01T09:00:00Z'), doNotFake: ['nextTick', 'setImmediate'] });
    db = new FakeFirestore();
    const firebase = { db } as never;
    const context = new TenantContext();
    const store = new GymStore(firebase, context);
    service = new GymClassBookingService(store, new MembersRepository(firebase, context, {} as never));
    as = (fn) => context.run({ tenantId: 't1', userId: 'staff-1', role: 'owner', modules: ['gym'], email: '' }, fn);
    db.docs.set(path('gymClassSchedules', 'c1'), {
      id: 'c1',
      createdAt: 'x',
      deletedAt: null,
      name: 'Pilates',
      dayOfWeek: 1,
      startTime: '19:00',
      capacity: 2,
      status: 'active',
    });
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
    const a = await as(() => service.book({ scheduleId: 'c1', userId: 'a' }));
    expect(a).toMatchObject({ sessionDate: MONDAY, attendanceStatus: 'booked', creditReserved: true, memberName: 'A', tenantId: 't1' });
    expect(booking(a.id)).toMatchObject({ userId: 'a', sessionDate: MONDAY });
    expect(memberDoc('a').classCreditsUsed).toBe(1);
    expect(await as(() => service.book({ scheduleId: 'c1', userId: 'a' }))).toMatchObject({ id: a.id }); // no double booking
    expect(memberDoc('a').classCreditsUsed).toBe(1);
    await as(() => service.book({ scheduleId: 'c1', userId: 'b' }));
    await expectCode(as(() => service.book({ scheduleId: 'c1', userId: 'c' })), ErrorCode.GYM_CLASS_FULL);
    // the following week is a different session with its own places
    expect(await as(() => service.book({ scheduleId: 'c1', userId: 'c', sessionDate: '2026-10-12' }))).toMatchObject({
      sessionDate: '2026-10-12',
    });
    expect(db.docs.get(path('gymClassSchedules', 'c1'))!['currentBookings']).toBe(2);
  });

  it('cannot overbook or spend a credit twice when requests arrive at the same time', async () => {
    member('a', { classCreditsTotal: 1 });
    member('b');
    member('c');
    const results = await Promise.allSettled([
      as(() => service.book({ scheduleId: 'c1', userId: 'a' })),
      as(() => service.book({ scheduleId: 'c1', userId: 'a', sessionDate: '2026-10-12' })),
      as(() => service.book({ scheduleId: 'c1', userId: 'b' })),
      as(() => service.book({ scheduleId: 'c1', userId: 'c' })),
    ]);
    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'rejected', 'fulfilled', 'rejected']);
    expect(((results[1] as PromiseRejectedResult).reason as AppException).code).toBe(ErrorCode.GYM_CLASS_NO_CREDIT);
    expect(((results[3] as PromiseRejectedResult).reason as AppException).code).toBe(ErrorCode.GYM_CLASS_FULL);
    expect(rows('gymClassBookings')).toHaveLength(2);
    expect(memberDoc('a').classCreditsUsed).toBe(1);
  });

  it('refuses a booking without credits left, for unknown members and dates the class does not run', async () => {
    member('a', { classCreditsTotal: 2, classCreditsUsed: 2 });
    await expectCode(as(() => service.book({ scheduleId: 'c1', userId: 'a' })), ErrorCode.GYM_CLASS_NO_CREDIT);
    member('b');
    await expectCode(as(() => service.book({ scheduleId: 'c1', userId: 'b', sessionDate: '2026-10-06' })), ErrorCode.VALIDATION_ERROR);
    await expectCode(as(() => service.book({ scheduleId: 'c1', userId: 'nobody' })), ErrorCode.GYM_MEMBER_NOT_FOUND);
    expect(rows('gymClassBookings')).toHaveLength(0);
  });

  it('refunds the credit on time, keeps it on a late cancel', async () => {
    member('a', { classCreditsTotal: 4 });
    const early = await as(() => service.book({ scheduleId: 'c1', userId: 'a' }));
    await as(() => service.cancel(early.id, { byStaff: false, userId: 'a' }));
    expect(memberDoc('a').classCreditsUsed).toBe(0);
    expect(booking(early.id)).toMatchObject({ attendanceStatus: 'cancelled', creditReserved: false, lateCancel: false });

    const late = await as(() => service.book({ scheduleId: 'c1', userId: 'a' }));
    jest.setSystemTime(new Date('2026-10-05T15:30:00Z')); // 18:30 Istanbul, 30 min before
    const cancelled = await as(() => service.cancel(late.id, { byStaff: false, userId: 'a' }));
    expect(cancelled).toMatchObject({ attendanceStatus: 'cancelled', lateCancel: true, creditReserved: true });
    expect(memberDoc('a').classCreditsUsed).toBe(1);
    // cancelling again changes nothing
    await as(() => service.cancel(late.id, { byStaff: true }));
    expect(memberDoc('a').classCreditsUsed).toBe(1);
  });

  it('only lets members cancel their own booking', async () => {
    member('a');
    const own = await as(() => service.book({ scheduleId: 'c1', userId: 'a' }));
    await expectCode(as(() => service.cancel(own.id, { byStaff: false, userId: 'b' })), ErrorCode.GYM_BOOKING_NOT_FOUND);
  });

  it('cancels, refunds and promotes the waitlist in one step, skipping members without credits', async () => {
    member('a', { classCreditsTotal: 4 });
    member('b');
    member('noCredit', { classCreditsTotal: 1, classCreditsUsed: 1 });
    member('w2', { classCreditsTotal: 3 });
    const a = await as(() => service.book({ scheduleId: 'c1', userId: 'a' }));
    await as(() => service.book({ scheduleId: 'c1', userId: 'b' }));
    expect(await as(() => service.joinWaitlist({ scheduleId: 'c1', userId: 'noCredit' }))).toMatchObject({ position: 1 });
    expect(await as(() => service.joinWaitlist({ scheduleId: 'c1', userId: 'w2' }))).toMatchObject({ position: 2 });
    await expectCode(as(() => service.joinWaitlist({ scheduleId: 'c1', userId: 'w2' })), ErrorCode.GYM_WAITLIST_EXISTS);
    await expectCode(as(() => service.joinWaitlist({ scheduleId: 'c1', userId: 'b' })), ErrorCode.GYM_WAITLIST_EXISTS);

    await as(() => service.cancel(a.id, { byStaff: false, userId: 'a' }));
    expect(memberDoc('a').classCreditsUsed).toBe(0); // refunded
    expect(memberDoc('w2').classCreditsUsed).toBe(1); // promoted, credit taken
    expect(memberDoc('noCredit').classCreditsUsed).toBe(1);
    const roster = await as(() => service.roster('c1', MONDAY));
    expect(booked(roster.bookings)).toEqual(['b', 'w2']);
    expect(roster.waitlist.map((w) => w.userId)).toEqual(['noCredit']);
    expect(roster.free).toBe(0);
    expect(rows('gymMemberNotifications')).toEqual([expect.objectContaining({ userId: 'w2', type: 'class_promoted' })]);
    expect(db.docs.get(path('gymClassSchedules', 'c1'))!['currentBookings']).toBe(2);
  });

  it('gives a freed place to exactly one member when a cancel and a manual promotion race', async () => {
    member('a');
    member('b');
    member('w1');
    member('w2');
    const a = await as(() => service.book({ scheduleId: 'c1', userId: 'a' }));
    await as(() => service.book({ scheduleId: 'c1', userId: 'b' }));
    await as(() => service.joinWaitlist({ scheduleId: 'c1', userId: 'w1' }));
    await as(() => service.joinWaitlist({ scheduleId: 'c1', userId: 'w2' }));
    const [, promoted] = await Promise.all([
      as(() => service.cancel(a.id, { byStaff: true })),
      as(() => service.promote('c1', MONDAY)),
    ]);
    expect(promoted).toEqual([]); // the cancel already filled the place
    const roster = await as(() => service.roster('c1', MONDAY));
    expect(booked(roster.bookings)).toEqual(['b', 'w1']);
    expect(roster.waitlist.map((w) => w.userId)).toEqual(['w2']);
  });

  it('records attendance and counts no-shows (also when closed automatically)', async () => {
    member('a');
    member('b');
    const a = await as(() => service.book({ scheduleId: 'c1', userId: 'a' }));
    const b = await as(() => service.book({ scheduleId: 'c1', userId: 'b' }));
    await as(() =>
      service.markAttendance('c1', MONDAY, [
        { bookingId: a.id, status: 'checked-in' },
        { bookingId: b.id, status: 'no-show' },
      ]),
    );
    expect(memberDoc('b').noShowCount).toBe(1);
    await as(() => service.markAttendance('c1', MONDAY, [{ bookingId: b.id, status: 'checked-in' }])); // corrected
    expect(memberDoc('b').noShowCount).toBe(0);

    member('c');
    const c = await as(() => service.book({ scheduleId: 'c1', userId: 'c', sessionDate: '2026-10-12' }));
    expect(await as(() => service.closePastSessions('2026-10-13'))).toBe(1);
    expect(booking(c.id).attendanceStatus).toBe('no-show');
    expect(memberDoc('c').noShowCount).toBe(1);
    expect(await as(() => service.closePastSessions('2026-10-13'))).toBe(0);
  });
});
