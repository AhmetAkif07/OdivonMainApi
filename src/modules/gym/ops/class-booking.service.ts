import { Injectable, Logger } from '@nestjs/common';
import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { TENANT_COLLECTION } from '../../../shared/firebase/firestore-path';
import { BaseDocument } from '../../../shared/firestore/base-document';
import { GymMember } from '../members/member.entity';
import { MembersRepository } from '../members/members.repository';
import { GymStore } from '../shared/gym-store';
import { creditsLeft, isTimelyCancel, LATE_CANCEL_HOURS, nextSessionDate, weekdayOf } from './class-booking.math';
import { gymToday } from './receivables.math';

type Doc = BaseDocument & Record<string, unknown>;

export type AttendanceStatus = 'booked' | 'checked-in' | 'no-show' | 'cancelled';

export interface ClassBooking extends BaseDocument {
  userId: string;
  memberName: string;
  classScheduleId: string;
  className: string;
  sessionDate: string;
  startTime: string;
  attendanceStatus: AttendanceStatus;
  /** One class credit was taken for this booking (members with limited credits). */
  creditReserved: boolean;
  lateCancel?: boolean;
  checkedInAt?: string | null;
  notes?: string;
  bookingDate: string;
}

const ACTIVE: AttendanceStatus[] = ['booked', 'checked-in'];

/**
 * Bookings per session of a weekly class, with capacity, class credits, the waitlist and
 * attendance. Used by the staff endpoints and the member app.
 *
 * Credits: a member whose package has `classCredits` gets that many per membership period. A
 * booking reserves one; cancelling at least LATE_CANCEL_HOURS before the start gives it back, a
 * late cancel or a no-show keeps it used. Unlimited packages (no classCredits) never run out.
 */
@Injectable()
export class GymClassBookingService {
  private readonly logger = new Logger(GymClassBookingService.name);

  constructor(
    private readonly store: GymStore,
    private readonly members: MembersRepository,
  ) {}

  async book(input: { scheduleId: string; userId: string; sessionDate?: string; notes?: string }): Promise<ClassBooking> {
    const schedule = await this.activeSchedule(input.scheduleId);
    const sessionDate = this.resolveDate(schedule, input.sessionDate);
    const bookings = await this.sessionBookings(schedule.id, sessionDate);
    const mine = bookings.find((b) => b.userId === input.userId);
    if (mine) return mine;
    const capacity = Number(schedule['capacity'] ?? 0);
    if (capacity && bookings.length >= capacity) {
      throw new AppException(ErrorCode.GYM_CLASS_FULL, 'Class is full');
    }
    const member = await this.members.getByIdOrThrow(input.userId);
    const reserved = await this.reserveCredit(member);
    const booking = await this.store.create<ClassBooking>(TENANT_COLLECTION.gymClassBookings, {
      userId: input.userId,
      memberName: member.displayName,
      classScheduleId: schedule.id,
      className: String(schedule['name'] ?? ''),
      sessionDate,
      startTime: String(schedule['startTime'] ?? ''),
      attendanceStatus: 'booked',
      creditReserved: reserved,
      checkedInAt: null,
      notes: input.notes ?? '',
      bookingDate: new Date().toISOString(),
    });
    await this.syncCount(schedule);
    return booking;
  }

  /** Cancels a booking; refunds the credit when on time (or done by staff) and promotes the waitlist. */
  async cancel(bookingId: string, options: { byStaff: boolean; userId?: string }) {
    const booking = await this.store.getOrThrow<ClassBooking>(
      TENANT_COLLECTION.gymClassBookings,
      bookingId,
      ErrorCode.GYM_BOOKING_NOT_FOUND,
      'Booking not found',
    );
    if (options.userId && booking.userId !== options.userId) {
      throw new AppException(ErrorCode.GYM_BOOKING_NOT_FOUND, 'Booking not found');
    }
    if (booking.attendanceStatus !== 'booked') return booking;
    const timely = !booking.sessionDate || isTimelyCancel(booking.sessionDate, booking.startTime);
    const refund = booking.creditReserved && (options.byStaff || timely);
    if (refund) await this.refundCredit(booking.userId);
    const updated = await this.store.update<ClassBooking>(
      TENANT_COLLECTION.gymClassBookings,
      bookingId,
      ErrorCode.GYM_BOOKING_NOT_FOUND,
      'Booking not found',
      { attendanceStatus: 'cancelled', lateCancel: !timely && !options.byStaff, creditReserved: booking.creditReserved && !refund },
    );
    const schedule = await this.schedule(booking.classScheduleId).catch(() => null);
    if (schedule) {
      if (booking.sessionDate) await this.promote(schedule.id, booking.sessionDate);
      await this.syncCount(schedule);
    }
    return updated;
  }

  async joinWaitlist(input: { scheduleId: string; userId: string; sessionDate?: string }) {
    const schedule = await this.activeSchedule(input.scheduleId);
    const sessionDate = this.resolveDate(schedule, input.sessionDate);
    const waitlist = await this.sessionWaitlist(schedule.id, sessionDate);
    if (waitlist.some((w) => w['userId'] === input.userId)) {
      throw new AppException(ErrorCode.GYM_WAITLIST_EXISTS, 'Already on waitlist');
    }
    const bookings = await this.sessionBookings(schedule.id, sessionDate);
    if (bookings.some((b) => b.userId === input.userId)) {
      throw new AppException(ErrorCode.GYM_WAITLIST_EXISTS, 'Already booked');
    }
    const member = await this.members.getByIdOrThrow(input.userId);
    const created = await this.store.create<Doc>(TENANT_COLLECTION.gymClassWaitlist, {
      userId: input.userId,
      memberName: member.displayName,
      classScheduleId: schedule.id,
      sessionDate,
    });
    return { id: created.id, status: 'waitlisted', sessionDate, position: waitlist.length + 1 };
  }

  /**
   * Fills free places of a session from its waitlist, first come first served. Members without a
   * class credit left are skipped (and stay on the list) so they cannot block others.
   */
  async promote(scheduleId: string, sessionDate: string): Promise<ClassBooking[]> {
    const schedule = await this.schedule(scheduleId);
    const promoted: ClassBooking[] = [];
    const capacity = Number(schedule['capacity'] ?? 0);
    for (const entry of await this.sessionWaitlist(scheduleId, sessionDate)) {
      const taken = (await this.sessionBookings(scheduleId, sessionDate)).length;
      if (capacity && taken >= capacity) break;
      const userId = String(entry['userId']);
      const member = await this.members.getByIdOrThrow(userId).catch(() => null);
      if (!member || member.isArchived || creditsLeft(member) === 0) continue;
      await this.store.softDelete(TENANT_COLLECTION.gymClassWaitlist, entry.id, ErrorCode.GYM_CLASS_NOT_FOUND, 'Waitlist not found');
      const booking = await this.book({ scheduleId, userId, sessionDate });
      promoted.push(booking);
      await this.store.create(TENANT_COLLECTION.gymMemberNotifications, {
        userId,
        type: 'class_promoted',
        title: 'Bekleme listesinden yer açıldı',
        body: `${String(schedule['name'] ?? 'Ders')} (${sessionDate} ${String(schedule['startTime'] ?? '')}) kaydın onaylandı.`,
        readAt: null,
      });
    }
    return promoted;
  }

  /** Staff view of one session: bookings with attendance, the waitlist and the free places. */
  async roster(scheduleId: string, sessionDate?: string) {
    const schedule = await this.schedule(scheduleId);
    const date = sessionDate ?? nextSessionDate(Number(schedule['dayOfWeek'] ?? 1), String(schedule['startTime'] ?? ''));
    const all = (await this.store.list<ClassBooking>(TENANT_COLLECTION.gymClassBookings)).filter(
      (b) => b.classScheduleId === scheduleId && b.sessionDate === date,
    );
    const capacity = Number(schedule['capacity'] ?? 0);
    const active = all.filter((b) => ACTIVE.includes(b.attendanceStatus));
    return {
      scheduleId,
      className: String(schedule['name'] ?? ''),
      sessionDate: date,
      startTime: String(schedule['startTime'] ?? ''),
      capacity,
      free: capacity ? Math.max(0, capacity - active.length) : null,
      bookings: all.sort((a, b) => a.memberName.localeCompare(b.memberName, 'tr')),
      waitlist: (await this.sessionWaitlist(scheduleId, date)).map((w, i) => ({
        id: w.id,
        position: i + 1,
        userId: String(w['userId']),
        memberName: String(w['memberName'] ?? ''),
        createdAt: w.createdAt,
      })),
    };
  }

  /** Marks who came and who did not; a no-show keeps the credit used and is counted on the member. */
  async markAttendance(scheduleId: string, sessionDate: string, entries: { bookingId: string; status: 'checked-in' | 'no-show' }[]) {
    const results: ClassBooking[] = [];
    for (const entry of entries) {
      const booking = await this.store.getOrThrow<ClassBooking>(
        TENANT_COLLECTION.gymClassBookings,
        entry.bookingId,
        ErrorCode.GYM_BOOKING_NOT_FOUND,
        'Booking not found',
      );
      if (booking.classScheduleId !== scheduleId || booking.sessionDate !== sessionDate) {
        throw new AppException(ErrorCode.VALIDATION_ERROR, 'Booking does not belong to this session');
      }
      if (booking.attendanceStatus === 'cancelled' || booking.attendanceStatus === entry.status) {
        results.push(booking);
        continue;
      }
      const wasNoShow = booking.attendanceStatus === 'no-show';
      if (entry.status === 'no-show' || wasNoShow) {
        await this.adjustNoShow(booking.userId, entry.status === 'no-show' ? 1 : -1);
      }
      results.push(
        await this.store.update<ClassBooking>(TENANT_COLLECTION.gymClassBookings, booking.id, ErrorCode.GYM_BOOKING_NOT_FOUND, 'Booking not found', {
          attendanceStatus: entry.status,
          checkedInAt: entry.status === 'checked-in' ? new Date().toISOString() : null,
        }),
      );
    }
    return results;
  }

  /** Daily: bookings of sessions before today nobody marked become no-shows. */
  async closePastSessions(today = gymToday()): Promise<number> {
    const stale = (await this.store.list<ClassBooking>(TENANT_COLLECTION.gymClassBookings)).filter(
      (b) => b.attendanceStatus === 'booked' && !!b.sessionDate && b.sessionDate < today,
    );
    for (const booking of stale) {
      await this.store.update(TENANT_COLLECTION.gymClassBookings, booking.id, ErrorCode.GYM_BOOKING_NOT_FOUND, 'Booking not found', {
        attendanceStatus: 'no-show',
        autoClosed: true,
      });
      await this.adjustNoShow(booking.userId, 1);
    }
    if (stale.length) this.logger.log(`Closed ${stale.length} unmarked bookings as no-show`);
    return stale.length;
  }

  private async reserveCredit(member: GymMember): Promise<boolean> {
    const left = creditsLeft(member);
    if (left === null) return false;
    if (left <= 0) {
      throw new AppException(ErrorCode.GYM_CLASS_NO_CREDIT, 'No class credits left in the current package');
    }
    await this.members.save({ ...member, classCreditsUsed: (member.classCreditsUsed ?? 0) + 1 });
    return true;
  }

  private async refundCredit(userId: string) {
    const member = await this.members.getByIdOrThrow(userId).catch(() => null);
    if (!member || member.classCreditsTotal == null) return;
    await this.members.save({ ...member, classCreditsUsed: Math.max(0, (member.classCreditsUsed ?? 0) - 1) });
  }

  private async adjustNoShow(userId: string, delta: number) {
    const member = await this.members.getByIdOrThrow(userId).catch(() => null);
    if (!member) return;
    await this.members.save({ ...member, noShowCount: Math.max(0, (member.noShowCount ?? 0) + delta) });
  }

  private resolveDate(schedule: Doc, requested?: string): string {
    const dayOfWeek = Number(schedule['dayOfWeek'] ?? 1);
    const startTime = String(schedule['startTime'] ?? '');
    if (!requested) return nextSessionDate(dayOfWeek, startTime);
    if (weekdayOf(requested) !== dayOfWeek) {
      throw new AppException(ErrorCode.VALIDATION_ERROR, 'sessionDate is not a day this class runs');
    }
    if (requested < gymToday()) {
      throw new AppException(ErrorCode.VALIDATION_ERROR, 'sessionDate is in the past');
    }
    return requested;
  }

  private async sessionBookings(scheduleId: string, sessionDate: string): Promise<ClassBooking[]> {
    return (await this.store.list<ClassBooking>(TENANT_COLLECTION.gymClassBookings)).filter(
      (b) => b.classScheduleId === scheduleId && b.sessionDate === sessionDate && ACTIVE.includes(b.attendanceStatus),
    );
  }

  /** Waitlist of one session, oldest first (entries from before sessions existed count for any date). */
  private async sessionWaitlist(scheduleId: string, sessionDate: string): Promise<Doc[]> {
    return (await this.store.list<Doc>(TENANT_COLLECTION.gymClassWaitlist))
      .filter((w) => w['classScheduleId'] === scheduleId && (!w['sessionDate'] || w['sessionDate'] === sessionDate))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  /** Keeps `currentBookings` on the schedule meaning "booked for the next session" (shown in lists). */
  private async syncCount(schedule: Doc) {
    const next = nextSessionDate(Number(schedule['dayOfWeek'] ?? 1), String(schedule['startTime'] ?? ''));
    const count = (await this.sessionBookings(schedule.id, next)).length;
    await this.store.save(TENANT_COLLECTION.gymClassSchedules, { ...schedule, currentBookings: count } as Doc);
  }

  private schedule(id: string) {
    return this.store.getOrThrow<Doc>(TENANT_COLLECTION.gymClassSchedules, id, ErrorCode.GYM_CLASS_NOT_FOUND, 'Class not found');
  }

  private async activeSchedule(id: string) {
    const schedule = await this.schedule(id);
    if (schedule['status'] && schedule['status'] !== 'active') {
      throw new AppException(ErrorCode.GYM_CLASS_NOT_FOUND, 'Class is not open for booking');
    }
    return schedule;
  }
}

export { LATE_CANCEL_HOURS };
