import { Injectable, Logger } from '@nestjs/common';
import { DocumentReference, Transaction } from 'firebase-admin/firestore';
import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { TENANT_COLLECTION } from '../../../shared/firebase/firestore-path';
import { BaseDocument, createBaseFields, isDeleted, touchBaseFields } from '../../../shared/firestore/base-document';
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

/** One session of a weekly class as read inside a transaction; `bookings` are the active ones. */
interface Session {
  schedule: Doc;
  sessionDate: string;
  bookings: ClassBooking[];
}

/** Members read inside a transaction; credit changes are collected and written once at the end. */
class MemberCredits {
  readonly byId = new Map<string, GymMember>();
  private readonly changed = new Set<string>();

  get(userId: string) {
    return this.byId.get(userId);
  }

  take(member: GymMember): boolean {
    if (creditsLeft(member) === null) return false;
    member.classCreditsUsed = (member.classCreditsUsed ?? 0) + 1;
    this.changed.add(member.uid);
    return true;
  }

  giveBack(userId: string) {
    const member = this.byId.get(userId);
    if (!member || member.classCreditsTotal == null) return;
    member.classCreditsUsed = Math.max(0, (member.classCreditsUsed ?? 0) - 1);
    this.changed.add(userId);
  }

  write(tx: Transaction, ref: (uid: string) => DocumentReference, userId: string) {
    for (const uid of this.changed) {
      tx.update(ref(uid), { classCreditsUsed: this.byId.get(uid)!.classCreditsUsed, ...touchBaseFields(userId) });
    }
  }
}

/**
 * Bookings per session of a weekly class, with capacity, class credits, the waitlist and
 * attendance. Used by the staff endpoints and the member app.
 *
 * Credits: a member whose package has `classCredits` gets that many per membership period. A
 * booking reserves one; cancelling at least LATE_CANCEL_HOURS before the start gives it back, a
 * late cancel or a no-show keeps it used. Unlimited packages (no classCredits) never run out.
 *
 * Booking, cancelling (with the refund and the automatic promotion from the waitlist) and joining
 * the waitlist each run in one Firestore transaction that reads the session's bookings and the
 * members involved, so two requests at once cannot overbook a session or spend a credit twice.
 */
@Injectable()
export class GymClassBookingService {
  private readonly logger = new Logger(GymClassBookingService.name);

  constructor(
    private readonly store: GymStore,
    private readonly members: MembersRepository,
  ) {}

  book(input: { scheduleId: string; userId: string; sessionDate?: string; notes?: string }): Promise<ClassBooking> {
    return this.transaction(async (tx) => {
      const schedule = await this.readOpenSchedule(tx, input.scheduleId);
      const sessionDate = this.resolveDate(schedule, input.sessionDate);
      const session: Session = { schedule, sessionDate, bookings: await this.readBookings(tx, schedule.id, sessionDate) };
      const mine = session.bookings.find((b) => b.userId === input.userId);
      if (mine) return mine;
      if (this.isFull(session)) {
        throw new AppException(ErrorCode.GYM_CLASS_FULL, 'Class is full');
      }
      const credits = await this.readMembers(tx, [input.userId]);
      const member = credits.get(input.userId);
      if (!member) throw new AppException(ErrorCode.GYM_MEMBER_NOT_FOUND, 'Member not found');
      if (creditsLeft(member) === 0) {
        throw new AppException(ErrorCode.GYM_CLASS_NO_CREDIT, 'No class credits left in the current package');
      }
      const booking = this.addBooking(tx, session, member, credits, input.notes);
      this.writeCount(tx, session);
      credits.write(tx, (uid) => this.ref(TENANT_COLLECTION.gymMembers, uid), this.store.userId());
      return booking;
    });
  }

  /** Cancels a booking; refunds the credit when on time (or done by staff) and promotes the waitlist. */
  cancel(bookingId: string, options: { byStaff: boolean; userId?: string }): Promise<ClassBooking> {
    return this.transaction(async (tx) => {
      const ref = this.ref(TENANT_COLLECTION.gymClassBookings, bookingId);
      const snapshot = await tx.get(ref);
      const booking = snapshot.exists ? (snapshot.data() as ClassBooking) : null;
      if (!booking || isDeleted(booking) || (options.userId && booking.userId !== options.userId)) {
        throw new AppException(ErrorCode.GYM_BOOKING_NOT_FOUND, 'Booking not found');
      }
      if (booking.attendanceStatus !== 'booked') return booking;

      // Reads: the session (when the class still exists), its waitlist and every member involved.
      const schedule = await this.readSchedule(tx, booking.classScheduleId);
      const session: Session | null =
        schedule && booking.sessionDate
          ? { schedule, sessionDate: booking.sessionDate, bookings: await this.readBookings(tx, schedule.id, booking.sessionDate) }
          : null;
      const waitlist = session ? await this.readWaitlist(tx, session.schedule.id, session.sessionDate) : [];
      const credits = await this.readMembers(tx, [booking.userId, ...waitlist.map((w) => String(w['userId']))]);

      // Writes.
      const timely = !booking.sessionDate || isTimelyCancel(booking.sessionDate, booking.startTime);
      const refund = booking.creditReserved && (options.byStaff || timely);
      if (refund) credits.giveBack(booking.userId);
      const patch = {
        attendanceStatus: 'cancelled' as const,
        lateCancel: !timely && !options.byStaff,
        creditReserved: booking.creditReserved && !refund,
        ...touchBaseFields(this.store.userId()),
      };
      tx.update(ref, patch);
      if (session) {
        session.bookings = session.bookings.filter((b) => b.id !== booking.id);
        this.fillFromWaitlist(tx, session, waitlist, credits);
        this.writeCount(tx, session);
      }
      credits.write(tx, (uid) => this.ref(TENANT_COLLECTION.gymMembers, uid), this.store.userId());
      return { ...booking, ...patch };
    });
  }

  joinWaitlist(input: { scheduleId: string; userId: string; sessionDate?: string }) {
    return this.transaction(async (tx) => {
      const schedule = await this.readOpenSchedule(tx, input.scheduleId);
      const sessionDate = this.resolveDate(schedule, input.sessionDate);
      const waitlist = await this.readWaitlist(tx, schedule.id, sessionDate);
      if (waitlist.some((w) => w['userId'] === input.userId)) {
        throw new AppException(ErrorCode.GYM_WAITLIST_EXISTS, 'Already on waitlist');
      }
      const bookings = await this.readBookings(tx, schedule.id, sessionDate);
      if (bookings.some((b) => b.userId === input.userId)) {
        throw new AppException(ErrorCode.GYM_WAITLIST_EXISTS, 'Already booked');
      }
      const member = (await this.readMembers(tx, [input.userId])).get(input.userId);
      if (!member) throw new AppException(ErrorCode.GYM_MEMBER_NOT_FOUND, 'Member not found');
      const ref = this.store.collection(TENANT_COLLECTION.gymClassWaitlist).doc();
      tx.set(ref, {
        ...this.baseFields(ref.id),
        userId: input.userId,
        memberName: member.displayName,
        classScheduleId: schedule.id,
        sessionDate,
      });
      return { id: ref.id, status: 'waitlisted', sessionDate, position: waitlist.length + 1 };
    });
  }

  /**
   * Fills free places of a session from its waitlist, first come first served. Members without a
   * class credit left are skipped (and stay on the list) so they cannot block others.
   */
  promote(scheduleId: string, sessionDate: string): Promise<ClassBooking[]> {
    return this.transaction(async (tx) => {
      const schedule = await this.readSchedule(tx, scheduleId);
      if (!schedule) throw new AppException(ErrorCode.GYM_CLASS_NOT_FOUND, 'Class not found');
      const session: Session = { schedule, sessionDate, bookings: await this.readBookings(tx, scheduleId, sessionDate) };
      const waitlist = await this.readWaitlist(tx, scheduleId, sessionDate);
      const credits = await this.readMembers(tx, waitlist.map((w) => String(w['userId'])));
      const promoted = this.fillFromWaitlist(tx, session, waitlist, credits);
      this.writeCount(tx, session);
      credits.write(tx, (uid) => this.ref(TENANT_COLLECTION.gymMembers, uid), this.store.userId());
      return promoted;
    });
  }

  /** Staff view of one session: bookings with attendance, the waitlist and the free places. */
  async roster(scheduleId: string, sessionDate?: string) {
    const schedule = await this.schedule(scheduleId);
    const date = sessionDate ?? nextSessionDate(Number(schedule['dayOfWeek'] ?? 1), String(schedule['startTime'] ?? ''));
    const all = (await this.sessionQuery(scheduleId, date).get()).docs
      .map((doc) => doc.data() as ClassBooking)
      .filter((b) => !isDeleted(b));
    const capacity = Number(schedule['capacity'] ?? 0);
    const active = all.filter((b) => ACTIVE.includes(b.attendanceStatus));
    const waitlist = this.sessionWaitlist((await this.waitlistQuery(scheduleId).get()).docs.map((doc) => doc.data() as Doc), date);
    return {
      scheduleId,
      className: String(schedule['name'] ?? ''),
      sessionDate: date,
      startTime: String(schedule['startTime'] ?? ''),
      capacity,
      free: capacity ? Math.max(0, capacity - active.length) : null,
      bookings: all.sort((a, b) => a.memberName.localeCompare(b.memberName, 'tr')),
      waitlist: waitlist.map((w, i) => ({
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

  // ─── Transaction steps (all reads happen before the first write) ────────────────────────────

  private transaction<T>(run: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.store.collection(TENANT_COLLECTION.gymClassBookings).firestore.runTransaction(run);
  }

  private async readSchedule(tx: Transaction, id: string): Promise<Doc | null> {
    const snapshot = await tx.get(this.ref(TENANT_COLLECTION.gymClassSchedules, id));
    const schedule = snapshot.exists ? (snapshot.data() as Doc) : null;
    return schedule && !isDeleted(schedule) ? schedule : null;
  }

  private async readOpenSchedule(tx: Transaction, id: string): Promise<Doc> {
    const schedule = await this.readSchedule(tx, id);
    if (!schedule) throw new AppException(ErrorCode.GYM_CLASS_NOT_FOUND, 'Class not found');
    if (schedule['status'] && schedule['status'] !== 'active') {
      throw new AppException(ErrorCode.GYM_CLASS_NOT_FOUND, 'Class is not open for booking');
    }
    return schedule;
  }

  private async readBookings(tx: Transaction, scheduleId: string, sessionDate: string): Promise<ClassBooking[]> {
    const snapshot = await tx.get(this.sessionQuery(scheduleId, sessionDate));
    return snapshot.docs
      .map((doc) => doc.data() as ClassBooking)
      .filter((b) => !isDeleted(b) && ACTIVE.includes(b.attendanceStatus));
  }

  private async readWaitlist(tx: Transaction, scheduleId: string, sessionDate: string): Promise<Doc[]> {
    const snapshot = await tx.get(this.waitlistQuery(scheduleId));
    return this.sessionWaitlist(snapshot.docs.map((doc) => doc.data() as Doc), sessionDate);
  }

  private async readMembers(tx: Transaction, userIds: string[]): Promise<MemberCredits> {
    const credits = new MemberCredits();
    const unique = [...new Set(userIds)];
    if (!unique.length) return credits;
    const snapshots = await tx.getAll(...unique.map((uid) => this.ref(TENANT_COLLECTION.gymMembers, uid)));
    for (const snapshot of snapshots) {
      const member = snapshot.exists ? (snapshot.data() as GymMember) : null;
      if (member && !isDeleted(member)) credits.byId.set(snapshot.id, { ...member, uid: member.uid ?? snapshot.id });
    }
    return credits;
  }

  private isFull(session: Session) {
    const capacity = Number(session.schedule['capacity'] ?? 0);
    return capacity > 0 && session.bookings.length >= capacity;
  }

  private addBooking(tx: Transaction, session: Session, member: GymMember, credits: MemberCredits, notes?: string): ClassBooking {
    const ref = this.store.collection(TENANT_COLLECTION.gymClassBookings).doc();
    const booking = {
      ...this.baseFields(ref.id),
      userId: member.uid,
      memberName: member.displayName,
      classScheduleId: session.schedule.id,
      className: String(session.schedule['name'] ?? ''),
      sessionDate: session.sessionDate,
      startTime: String(session.schedule['startTime'] ?? ''),
      attendanceStatus: 'booked' as const,
      creditReserved: credits.take(member),
      checkedInAt: null,
      notes: notes ?? '',
      bookingDate: new Date().toISOString(),
    };
    tx.set(ref, booking);
    session.bookings.push(booking);
    return booking;
  }

  /** Books waiting members into the free places (in order) and tells each one in the member app. */
  private fillFromWaitlist(tx: Transaction, session: Session, waitlist: Doc[], credits: MemberCredits): ClassBooking[] {
    const promoted: ClassBooking[] = [];
    for (const entry of waitlist) {
      if (this.isFull(session)) break;
      const userId = String(entry['userId']);
      const member = credits.get(userId);
      if (!member || member.isArchived || creditsLeft(member) === 0) continue;
      tx.update(this.ref(TENANT_COLLECTION.gymClassWaitlist, entry.id), {
        deletedAt: new Date().toISOString(),
        ...touchBaseFields(this.store.userId()),
      });
      if (session.bookings.some((b) => b.userId === userId)) continue; // already booked meanwhile
      promoted.push(this.addBooking(tx, session, member, credits));
      const notification = this.store.collection(TENANT_COLLECTION.gymMemberNotifications).doc();
      tx.set(notification, {
        ...this.baseFields(notification.id),
        userId,
        type: 'class_promoted',
        title: 'Bekleme listesinden yer açıldı',
        body: `${String(session.schedule['name'] ?? 'Ders')} (${session.sessionDate} ${String(session.schedule['startTime'] ?? '')}) kaydın onaylandı.`,
        readAt: null,
      });
    }
    return promoted;
  }

  /** Keeps `currentBookings` on the schedule meaning "booked for the next session" (shown in lists). */
  private writeCount(tx: Transaction, session: Session) {
    const next = nextSessionDate(Number(session.schedule['dayOfWeek'] ?? 1), String(session.schedule['startTime'] ?? ''));
    if (session.sessionDate !== next) return;
    tx.update(this.ref(TENANT_COLLECTION.gymClassSchedules, session.schedule.id), {
      currentBookings: session.bookings.length,
      ...touchBaseFields(this.store.userId()),
    });
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────────────────────

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

  /** Equality-only filters on two fields: served by Firestore's single-field indexes. */
  private sessionQuery(scheduleId: string, sessionDate: string) {
    return this.store
      .collection(TENANT_COLLECTION.gymClassBookings)
      .where('classScheduleId', '==', scheduleId)
      .where('sessionDate', '==', sessionDate);
  }

  private waitlistQuery(scheduleId: string) {
    return this.store.collection(TENANT_COLLECTION.gymClassWaitlist).where('classScheduleId', '==', scheduleId);
  }

  /** Waitlist of one session, oldest first (entries from before sessions existed count for any date). */
  private sessionWaitlist(entries: Doc[], sessionDate: string): Doc[] {
    return entries
      .filter((w) => !isDeleted(w) && (!w['sessionDate'] || w['sessionDate'] === sessionDate))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  }

  private baseFields(id: string) {
    return { ...createBaseFields(id, this.store.userId()), tenantId: this.store.tenantId() };
  }

  private ref(collection: string, id: string) {
    return this.store.collection(collection).doc(id);
  }

  private schedule(id: string) {
    return this.store.getOrThrow<Doc>(TENANT_COLLECTION.gymClassSchedules, id, ErrorCode.GYM_CLASS_NOT_FOUND, 'Class not found');
  }
}

export { LATE_CANCEL_HOURS };
