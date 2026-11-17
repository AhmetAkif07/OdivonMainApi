import { Injectable } from '@nestjs/common';
import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { TENANT_COLLECTION } from '../../../shared/firebase/firestore-path';
import { BaseDocument } from '../../../shared/firestore/base-document';
import { TenantContext } from '../../../shared/tenancy/tenant.context';
import { GymMember } from '../members/member.entity';
import { MembersRepository } from '../members/members.repository';
import { daysRemaining, toMeasurement, toWorkoutSession, toWorkoutSummary } from '../mobile/mobile.service';
import { RegisterDeviceDto } from '../mobile/mobile.dto';
import { ResolveProgramRequestDto, toProgramRequest } from '../ops/program-request.dto';
import { GymSportService } from '../ops/sport.service';
import { GymStore } from '../shared/gym-store';
import { liveSummary, liveView } from '../shared/live-session';
import { isOpenRequest } from '../shared/member-requests';
import { PlanProgress, planProgress } from '../shared/plan-progress';
import { loadPlanStats } from '../shared/plan-progress.store';
import { trainerIdentity } from '../shared/trainer-scope';
import { planContent } from '../shared/workout-plan.normalize';
import { presenceFromLogs, presenceView, startOfDayTr } from '../signals/presence.rules';
import { GymPresenceService } from '../signals/presence.service';
import { GymPushService } from '../signals/push.service';
import { CoachMembersQueryDto, CoachRequestsQueryDto, CoachSessionsQueryDto } from './coach.dto';
import { coachFlags, compareFloor, isMine, visitsThisMonthTr } from './coach.rules';

type Doc = BaseDocument & Record<string, unknown>;

/** Firestore `in` filters take at most 30 values. */
const IN_CHUNK = 30;
const MEMBER_LIST_LIMIT = 300;

/**
 * The trainer's view of the gym (mobile trainer mode and the panel's member training tab).
 * Read-only apart from requests and devices: programs and measurements are written through the
 * existing `/gym/workouts` and `/gym/measurements` routes.
 */
@Injectable()
export class GymCoachService {
  constructor(
    private readonly store: GymStore,
    private readonly tenant: TenantContext,
    private readonly members: MembersRepository,
    private readonly presence: GymPresenceService,
    private readonly push: GymPushService,
    private readonly sport: GymSportService,
  ) {}

  async me() {
    const ctx = this.tenant.getStore();
    const identity = await trainerIdentity(this.store, ctx);
    return {
      userId: ctx.userId,
      staffId: identity.staffId,
      trainerIds: identity.ids,
      name: identity.name,
      email: ctx.email,
      role: ctx.role,
      permissions: ctx.permissions ?? {},
    };
  }

  /**
   * Who is in the gym today: members who came through the turnstile today plus anyone with a
   * workout running, with their live workout, open requests and program state.
   */
  async floor(now = Date.now()) {
    const tenantId = this.store.tenantId();
    const [identity, entered, activeSessions, openRequests] = await Promise.all([
      trainerIdentity(this.store, this.tenant.getStore()),
      this.presence.listEnteredSince(tenantId, new Date(startOfDayTr(now)).toISOString()),
      this.activeSessions(now),
      this.openRequests(now),
    ]);
    const presenceByUser = new Map(entered.map((item) => [item.userId, item]));
    const userIds = [...new Set([...presenceByUser.keys(), ...activeSessions.keys(), ...helpCallers(openRequests)])];
    const [members, plans] = await Promise.all([this.membersById(userIds), this.activePlansByUser(userIds)]);
    const requestsByUser = groupBy(openRequests, (item) => String(item['userId'] ?? ''));

    const rows = userIds
      .map((userId) => {
        const member = members.get(userId);
        if (!member) return null;
        const presence = presenceView(presenceByUser.get(userId) ?? null, now);
        const session = activeSessions.get(userId);
        const live = session ? liveSummary(session, now) : null;
        const memberPlans = plans.get(userId) ?? [];
        const requests = requestsByUser.get(userId) ?? [];
        const flags = coachFlags({
          requests,
          live: Boolean(live),
          activePlanProgress: memberPlans.map((item) => item.progress),
          membershipEndsAt: member.membershipEndsAt,
          now,
        });
        return {
          member: memberCard(member),
          mine: isMine(member, identity.ids),
          inside: presence.inside,
          lastInAt: presence.lastInAt,
          presence,
          live,
          plan: memberPlans[0] ? { id: memberPlans[0].plan.id, title: String(memberPlans[0].plan['title'] ?? 'Program'), progress: memberPlans[0].progress } : null,
          requests: requests.map((item) => toProgramRequest(item, now)),
          flags,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null)
      .sort(compareFloor);

    return {
      generatedAt: new Date(now).toISOString(),
      insideCount: rows.filter((row) => row.inside).length,
      liveCount: rows.filter((row) => row.live).length,
      helpCount: rows.filter((row) => row.flags.includes('help')).length,
      items: rows,
    };
  }

  /** Member list for the trainer: own members (default) or everyone, with program state. */
  async listMembers(query: CoachMembersQueryDto, now = Date.now()) {
    const tenantId = this.store.tenantId();
    const [identity, all, entered] = await Promise.all([
      trainerIdentity(this.store, this.tenant.getStore()),
      this.members.list({ q: query.q, archived: false }),
      this.presence.listEnteredSince(tenantId, new Date(startOfDayTr(now)).toISOString()),
    ]);
    const scoped = (query.scope ?? 'mine') === 'mine' ? all.filter((member) => isMine(member, identity.ids)) : all;
    const page = scoped
      .sort((left, right) => left.displayName.localeCompare(right.displayName, 'tr'))
      .slice(0, MEMBER_LIST_LIMIT);
    const plans = await this.activePlansByUser(page.map((member) => member.uid));
    const presence = new Map(entered.map((item) => [item.userId, item]));
    return {
      scope: query.scope ?? 'mine',
      total: scoped.length,
      items: page.map((member) => {
        const memberPlans = plans.get(member.uid) ?? [];
        const view = presenceView(presence.get(member.uid) ?? null, now);
        const first = memberPlans[0];
        return {
          member: memberCard(member),
          mine: isMine(member, identity.ids),
          inside: view.inside,
          lastInAt: view.lastInAt,
          plan: first ? { id: first.plan.id, title: String(first.plan['title'] ?? 'Program'), progress: first.progress } : null,
          lastWorkoutAt: latest(memberPlans.map((item) => item.progress.lastSessionAt)),
          flags: coachFlags({
            requests: [],
            live: false,
            activePlanProgress: memberPlans.map((item) => item.progress),
            membershipEndsAt: member.membershipEndsAt,
            now,
          }),
        };
      }),
    };
  }

  /** Everything a trainer needs about one member on one screen. */
  async memberDetail(id: string, now = Date.now()) {
    const tenantId = this.store.tenantId();
    const member = await this.members.getByIdOrThrow(id);
    const [identity, storedPresence, logs, plans, sessions, measurements, requests] = await Promise.all([
      trainerIdentity(this.store, this.tenant.getStore()),
      this.presence.get(tenantId, id),
      this.store.listRecentBy<Doc>(TENANT_COLLECTION.gymAccessLogs, 'userId', id, 200),
      this.store.listBy<Doc>(TENANT_COLLECTION.gymWorkoutPlans, 'userId', id),
      this.store.listBy<Doc>(TENANT_COLLECTION.gymWorkoutSessions, 'userId', id),
      this.store.listBy<Doc>(TENANT_COLLECTION.gymMeasurements, 'userId', id),
      this.store.listBy<Doc>(TENANT_COLLECTION.gymProgramRequests, 'userId', id),
    ]);
    const planViews = await Promise.all(
      plans.map(async (plan) => {
        const progress = planProgress(plan, await loadPlanStats(this.store, plan), now);
        const { days } = planContent(plan);
        return {
          ...toWorkoutSummary(plan, progress),
          startDate: (plan['startDate'] as string | null) ?? null,
          endDate: (plan['endDate'] as string | null) ?? null,
          notes: (plan['notes'] as string | null) ?? null,
          days,
        };
      }),
    );
    const activePlans = planViews.filter((plan) => plan.status === 'active');
    const running = sessions
      .filter((item) => item['status'] === 'active')
      .map((item) => liveSummary(item, now))
      .find((item) => item !== null) ?? null;
    const completed = sessions
      .filter((item) => item['status'] === 'completed')
      .sort((left, right) => String(right['completedAt'] ?? '').localeCompare(String(left['completedAt'] ?? '')));
    const presence = presenceView(storedPresence ?? presenceFromLogs(logs), now);

    return {
      member: {
        ...memberCard(member),
        email: member.email,
        phone: member.phone,
        gender: member.gender,
        birthDate: member.birthDate,
      },
      mine: isMine(member, identity.ids),
      membership: {
        status: member.membershipStatus,
        packageLabel: member.packageLabel,
        startsAt: member.membershipStartsAt,
        endsAt: member.membershipEndsAt,
        daysLeft: daysRemaining(member.membershipEndsAt),
      },
      health: {
        bloodGroup: member.bloodGroup ?? null,
        allergies: member.allergies ?? null,
        chronicDiseases: member.chronicDiseases ?? null,
        specialInfo: member.specialInfo ?? null,
        notes: member.notes ?? null,
      },
      emergencyContact: member.emergencyContactName
        ? { name: member.emergencyContactName, phone: member.emergencyContactPhone, relation: member.emergencyContactRelation }
        : null,
      presence,
      visitsThisMonth: visitsThisMonthTr(logs, now),
      live: running,
      plans: planViews.sort((left, right) => Number(right.status === 'active') - Number(left.status === 'active')),
      recentSessions: completed.slice(0, 10).map(sessionSummary),
      completedSessionCount: completed.length,
      measurements: measurements
        .sort((left, right) => String(right['date'] ?? right.createdAt).localeCompare(String(left['date'] ?? left.createdAt)))
        .slice(0, 5)
        .map(toMeasurement),
      requests: requests
        .map((item) => toProgramRequest(item, now))
        .sort((left, right) => Number(isOpenRequest(right, now)) - Number(isOpenRequest(left, now)) || right.createdAt.localeCompare(left.createdAt))
        .slice(0, 20),
      flags: coachFlags({
        requests,
        live: Boolean(running),
        activePlanProgress: activePlans.map((plan) => plan.progress).filter((p): p is PlanProgress => p !== null),
        membershipEndsAt: member.membershipEndsAt,
        now,
      }),
    };
  }

  async memberSessions(id: string, query: CoachSessionsQueryDto) {
    await this.members.getByIdOrThrow(id);
    const sessions = (await this.store.listBy<Doc>(TENANT_COLLECTION.gymWorkoutSessions, 'userId', id))
      .filter((item) => item['status'] === 'completed' && (!query.planId || item['planId'] === query.planId))
      .sort((left, right) => String(right['completedAt'] ?? '').localeCompare(String(left['completedAt'] ?? '')));
    const limit = query.limit ?? 30;
    return { total: sessions.length, items: sessions.slice(0, limit).map(sessionSummary) };
  }

  /** One workout with its sets; for a running one also the live snapshot. */
  async session(id: string, now = Date.now()) {
    const item = await this.store.getOrThrow<Doc>(TENANT_COLLECTION.gymWorkoutSessions, id, ErrorCode.GYM_WORKOUT_NOT_FOUND, 'Session not found');
    const userId = String(item['userId'] ?? '');
    const member = userId ? await this.members.getByIdOrThrow(userId).catch(() => null) : null;
    if (!member) {
      throw new AppException(ErrorCode.GYM_WORKOUT_NOT_FOUND, 'Session not found');
    }
    return {
      ...toWorkoutSession(item, null),
      member: { id: member.uid, displayName: member.displayName, photoURL: member.photoURL },
      live: liveView(item, now),
    };
  }

  /** Requests of every kind the trainer may see; `status=open` (default) or `closed` or `all`. */
  async listRequests(query: CoachRequestsQueryDto, now = Date.now()) {
    const items = await this.sport.listProgramRequests({ type: query.type ?? 'all' });
    const wanted = query.status ?? 'open';
    const open = (item: { status: string }) => item.status === 'pending' || item.status === 'accepted';
    const filtered = items.filter((item) => wanted === 'all' || (wanted === 'open' ? open(item) : !open(item)));
    // Floor calls first, then oldest open first (waiting longest); closed ones newest first.
    return filtered
      .sort((left, right) => {
        if (wanted !== 'open') return right.createdAt.localeCompare(left.createdAt);
        const urgent = Number(right.type === 'floor_help') - Number(left.type === 'floor_help');
        return urgent || left.createdAt.localeCompare(right.createdAt);
      })
      .slice(0, 200)
      .map((item) => ({ ...item, ageMinutes: Math.max(0, Math.round((now - new Date(item.createdAt).getTime()) / 60_000)) }));
  }

  resolveRequest(id: string, dto: ResolveProgramRequestDto) {
    return this.sport.resolveProgramRequest(id, dto);
  }

  registerDevice(dto: RegisterDeviceDto) {
    return this.push.registerDevice(this.store.tenantId(), this.store.userId(), 'staff', {
      token: dto.token,
      platform: dto.platform,
      appVersion: dto.appVersion,
    });
  }

  unregisterDevice(token: string) {
    return this.push.unregisterDevice(this.store.tenantId(), this.store.userId(), token);
  }

  /** Running workouts by member (the newest per member), skipping abandoned ones. */
  private async activeSessions(now: number): Promise<Map<string, Doc>> {
    const items = await this.store.listBy<Doc>(TENANT_COLLECTION.gymWorkoutSessions, 'status', 'active');
    const byUser = new Map<string, Doc>();
    for (const item of items) {
      const userId = String(item['userId'] ?? '');
      if (!userId || byUser.has(userId) || !liveView(item, now)) continue;
      byUser.set(userId, item);
    }
    return byUser;
  }

  private async openRequests(now: number): Promise<Doc[]> {
    const snapshot = await this.store
      .collection(TENANT_COLLECTION.gymProgramRequests)
      .where('status', 'in', ['pending', 'accepted'])
      .get();
    return snapshot.docs.map((doc) => doc.data() as Doc).filter((item) => !item.deletedAt && isOpenRequest(item, now));
  }

  private async membersById(userIds: string[]): Promise<Map<string, GymMember>> {
    const found = new Map<string, GymMember>();
    const collection = this.store.collection(TENANT_COLLECTION.gymMembers);
    for (let start = 0; start < userIds.length; start += 100) {
      const refs = userIds.slice(start, start + 100).map((id) => collection.doc(id));
      if (!refs.length) continue;
      const snapshots = await collection.firestore.getAll(...refs);
      for (const snapshot of snapshots) {
        const member = snapshot.exists ? (snapshot.data() as GymMember) : null;
        if (member && !member.deletedAt && !member.isArchived) found.set(snapshot.id, member);
      }
    }
    return found;
  }

  /** Active plans of the given members with their progress, the most recently trained first. */
  private async activePlansByUser(userIds: string[]): Promise<Map<string, { plan: Doc; progress: PlanProgress }[]>> {
    const result = new Map<string, { plan: Doc; progress: PlanProgress }[]>();
    const collection = this.store.collection(TENANT_COLLECTION.gymWorkoutPlans);
    const unique = [...new Set(userIds.filter(Boolean))];
    for (let start = 0; start < unique.length; start += IN_CHUNK) {
      const snapshot = await collection.where('userId', 'in', unique.slice(start, start + IN_CHUNK)).get();
      const plans = snapshot.docs.map((doc) => doc.data() as Doc).filter((plan) => !plan.deletedAt && plan['status'] === 'active');
      for (const plan of plans) {
        const progress = planProgress(plan, await loadPlanStats(this.store, plan));
        const userId = String(plan['userId']);
        result.set(userId, [...(result.get(userId) ?? []), { plan, progress }]);
      }
    }
    for (const list of result.values()) {
      list.sort((left, right) => String(right.progress.lastSessionAt ?? '').localeCompare(String(left.progress.lastSessionAt ?? '')));
    }
    return result;
  }
}

function memberCard(member: GymMember) {
  return {
    id: member.uid,
    displayName: member.displayName,
    photoURL: member.photoURL,
    memberNumber: member.memberNumber,
    trainerId: member.trainerId,
    trainerName: member.trainerName,
    membershipStatus: member.membershipStatus,
    membershipEndsAt: member.membershipEndsAt,
  };
}

function sessionSummary(item: Doc) {
  const { sets, ...rest } = toWorkoutSession(item, null);
  const list = sets as Record<string, unknown>[];
  return {
    ...rest,
    setCount: list.filter((set) => set['status'] !== 'skipped').length,
    exerciseCount: new Set(list.map((set) => String(set['exerciseName'] ?? set['exerciseId'] ?? ''))).size,
  };
}

function helpCallers(requests: Doc[]): string[] {
  return requests.filter((item) => item['type'] === 'floor_help').map((item) => String(item['userId'] ?? '')).filter(Boolean);
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) map.set(key(item), [...(map.get(key(item)) ?? []), item]);
  return map;
}

function latest(values: (string | null)[]): string | null {
  return values.filter((value): value is string => Boolean(value)).sort().pop() ?? null;
}

