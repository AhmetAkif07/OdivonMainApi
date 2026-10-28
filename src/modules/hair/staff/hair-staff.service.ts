import { randomBytes } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { TENANT_COLLECTION } from '../../../shared/firebase/firestore-path';
import { TenantContext } from '../../../shared/tenancy/tenant.context';
import { UserProfile } from '../../identity/entities/user-profile.entity';
import { IdentityRepository } from '../../identity/identity.repository';
import { DEFAULT_STAFF_COLOR } from '../core/hair-core.service';
import { involvesStaff } from '../appointments/hair-appointments.service';
import { addDays, isOpenStatus, weekday } from '../shared/appointment-plan';
import { assertNoRelated, hairForbidden, hairInvalid, hairNotFound, hairPrecondition } from '../shared/hair-errors';
import { HairListQueryDto, searchTerm } from '../shared/hair-list.dto';
import { normalizePhone } from '../shared/hair-phone';
import { HAIR_STAFF_ROLES, hairRoleId, HairStaffRole } from '../shared/hair-roles';
import { HairActor, HairDoc, HairStore } from '../shared/hair-store';
import { dateIdInTz, parseClock } from '../shared/hair-time';
import { matchesSearch, str } from '../shared/hair-tx';
import {
  CreateHairShiftDto,
  CreateHairStaffDto,
  CreateHairTimeOffDto,
  InviteHairStaffDto,
  StaffScheduleQueryDto,
  UpdateHairShiftDto,
  UpdateHairStaffDto,
  UpdateHairTimeOffDto,
} from './staff.dto';

const STAFF_NOT_FOUND = 'Personel bulunamadı.';
const SHIFT_NOT_FOUND = 'Vardiya bulunamadı.';
const TIME_OFF_NOT_FOUND = 'İzin kaydı bulunamadı.';
const HAIR_ROLE_IDS = new Set(HAIR_STAFF_ROLES.map(hairRoleId));
/** Roles that may approve leave and hand out the admin/manager roles. */
const APPROVER_ROLES: readonly HairStaffRole[] = ['admin', 'manager'];

@Injectable()
export class HairStaffService {
  private readonly logger = new Logger(HairStaffService.name);

  constructor(
    private readonly store: HairStore,
    private readonly tenantContext: TenantContext,
    private readonly users: IdentityRepository,
  ) {}

  // ── Staff cards ──

  /** Stylists (`own` scope) only see their own card; others see staff of their branches. */
  async list(query: HairListQueryDto) {
    const actor = await this.store.actorOrThrow();
    const ownId = this.store.staffFilter(actor, 'hairStaff', undefined);
    const branches = query.branchId ? [query.branchId] : actor.branchIds;
    if (query.branchId) this.store.assertBranchAccess(actor, query.branchId);
    const term = searchTerm(query);
    return this.store.list(TENANT_COLLECTION.hairStaff, {
      equals: { role: query.type },
      match: (item) => {
        if (ownId && item.id !== ownId) return false;
        const staffBranches = asStrings(item['branchIds']);
        const inBranch = !branches || staffBranches.length === 0 || staffBranches.some((b) => branches.includes(b));
        const status = query.status ? (query.status === 'active') === (item['active'] !== false) : true;
        return inBranch && status && matchesSearch(item, term, ['firstName', 'lastName', 'email', 'phone']);
      },
      orderBy: { field: 'firstName', dir: 'asc' },
      limit: query.limit ?? 200,
      cursor: query.cursor,
    });
  }

  async get(id: string) {
    const actor = await this.store.actorOrThrow();
    this.store.staffFilter(actor, 'hairStaff', id);
    return this.store.getOrThrow(TENANT_COLLECTION.hairStaff, id, STAFF_NOT_FOUND);
  }

  async create(dto: CreateHairStaffDto) {
    const actor = await this.store.actorOrThrow();
    this.assertCanAssignRole(actor, dto.role);
    await this.assertBranches(dto.branchIds);
    assertSchedule(dto.workSchedule);
    return this.store.create(TENANT_COLLECTION.hairStaff, 'hairStaff', {
      ...dto,
      firstName: dto.firstName.trim(),
      lastName: dto.lastName.trim(),
      phone: dto.phone ? (normalizePhone(dto.phone) ?? dto.phone.trim()) : '',
      email: dto.email?.trim().toLowerCase() ?? '',
      inviteStatus: 'none',
      specialties: dto.specialties ?? [],
      serviceIds: dto.serviceIds ?? [],
      defaultCommissionPercent: dto.defaultCommissionPercent ?? 0,
      workSchedule: dto.workSchedule ? dto.workSchedule.map((e) => ({ ...e })) : [],
      hireDate: dto.hireDate ?? dateIdInTz(await this.store.timeZone()),
      active: dto.active ?? true,
      onlineBookable: dto.onlineBookable ?? true,
      color: dto.color ?? DEFAULT_STAFF_COLOR,
    });
  }

  /** Profile edit; a role change is mirrored to the linked user's `roleIds` (permissions). */
  async update(id: string, dto: UpdateHairStaffDto) {
    const actor = await this.store.actorOrThrow();
    const current = await this.store.getOrThrow(TENANT_COLLECTION.hairStaff, id, STAFF_NOT_FOUND);
    const userId = str(current['userId']);
    const roleChanges = dto.role !== undefined && dto.role !== current['role'];
    if (roleChanges) {
      this.assertCanAssignRole(actor, dto.role!);
      this.assertCanAssignRole(actor, current['role'] as HairStaffRole);
      if (userId && (await this.isOwnerUser(userId))) {
        throw hairForbidden('İşletme sahibinin rolü değiştirilemez.');
      }
    }
    if (dto.branchIds) await this.assertBranches(dto.branchIds);
    assertSchedule(dto.workSchedule);
    if (dto.active === false && userId === this.store.userId()) {
      throw hairPrecondition('Kendi kaydınızı pasifleştiremezsiniz.');
    }
    const losesAdmin = (roleChanges && dto.role !== 'admin') || (dto.active === false && current['active'] !== false);
    if (current['role'] === 'admin' && losesAdmin) await this.assertNotLastAdmin(id);

    const updated = await this.store.update(
      TENANT_COLLECTION.hairStaff,
      'hairStaff',
      id,
      {
        ...dto,
        firstName: dto.firstName?.trim(),
        lastName: dto.lastName?.trim(),
        email: dto.email?.trim().toLowerCase(),
        phone: dto.phone !== undefined ? (dto.phone.trim() ? (normalizePhone(dto.phone) ?? dto.phone.trim()) : '') : undefined,
        workSchedule: dto.workSchedule ? dto.workSchedule.map((e) => ({ ...e })) : undefined,
      },
      STAFF_NOT_FOUND,
    );
    if (userId && roleChanges) await this.syncRole(userId, dto.role!);
    if (userId && dto.active !== undefined && dto.active !== current['active']) {
      await this.syncActive(userId, dto.active);
    }
    return updated;
  }

  /** Soft-deletes the card and disables the linked panel account (never the owner's). */
  async remove(id: string) {
    const current = await this.store.getOrThrow(TENANT_COLLECTION.hairStaff, id, STAFF_NOT_FOUND);
    const userId = str(current['userId']);
    if (userId && (userId === this.store.userId() || (await this.isOwnerUser(userId)))) {
      throw hairForbidden('Bu personel kaydı silinemez.');
    }
    if (current['role'] === 'admin') await this.assertNotLastAdmin(id);
    const today = dateIdInTz(await this.store.timeZone());
    const upcoming = await this.store.rows(TENANT_COLLECTION.hairAppointments, undefined, { field: 'date', from: today });
    assertNoRelated('Personelin ileri tarihli randevuları var; önce randevuları devredin veya personeli pasifleştirin.', {
      futureAppointments: upcoming.filter((a) => isOpenStatus(a['status']) && involvesStaff(a, id)).length,
    });
    const result = await this.store.softDelete(TENANT_COLLECTION.hairStaff, 'hairStaff', id, STAFF_NOT_FOUND);
    if (userId) await this.syncActive(userId, false);
    return result;
  }

  /**
   * Creates a panel account for the staff card (Auth user + MainApi profile with the hair role) and
   * returns a password reset link the salon sends to the invitee.
   */
  async invite(id: string, dto: InviteHairStaffDto) {
    const staff = await this.store.getOrThrow(TENANT_COLLECTION.hairStaff, id, STAFF_NOT_FOUND);
    if (str(staff['userId'])) throw hairPrecondition('Bu personelin zaten bir hesabı var.');
    const email = (dto.email ?? str(staff['email'])).trim().toLowerCase();
    if (!email) throw hairInvalid('Davet için personelin e-posta adresi gerekli.');
    const role = staff['role'] as HairStaffRole;
    const current = this.tenantContext.getStore();
    const displayName = `${str(staff['firstName'])} ${str(staff['lastName'])}`.trim() || email;
    let uid: string | undefined;
    let profileCreated = false;

    try {
      // Never shown to anyone — the invitee sets their own password through the reset link.
      const record = await this.store.auth.createUser({
        email,
        password: randomBytes(24).toString('base64url'),
        displayName,
      });
      uid = record.uid;
      const now = new Date().toISOString();
      const profile: UserProfile = {
        uid,
        tenantId: current.tenantId,
        role: 'user',
        accountType: 'staff',
        modules: current.modules,
        email,
        displayName,
        roleIds: [hairRoleId(role)],
        status: 'active',
        createdAt: now,
        updatedAt: now,
      };
      await this.users.createProfile(profile);
      profileCreated = true;
      await this.store.auth.setCustomUserClaims(uid, {
        tenantId: current.tenantId,
        role: 'user',
        modules: current.modules,
      });
      await this.store.update(
        TENANT_COLLECTION.hairStaff,
        'hairStaff',
        id,
        { userId: uid, email, inviteStatus: 'invited', invitedAt: now },
        STAFF_NOT_FOUND,
      );
      const resetLink = await this.store.auth.generatePasswordResetLink(email);
      return { staffId: id, userId: uid, email, inviteStatus: 'invited', resetLink };
    } catch (error) {
      if (uid) {
        if (profileCreated) await this.users.hardDelete(uid).catch((err) => this.logger.error(err));
        await this.store.auth.deleteUser(uid).catch((err) => this.logger.error(err));
      }
      const info = error as { code?: string; errorInfo?: { code?: string } };
      if ((info?.errorInfo?.code ?? info?.code) === 'auth/email-already-exists') {
        throw hairPrecondition('Bu e-posta adresiyle kayıtlı bir kullanıcı zaten var.');
      }
      throw error;
    }
  }

  /** Shifts, approved/pending leave and appointments of one staff member in [from, to] (dates). */
  async schedule(id: string, query: StaffScheduleQueryDto) {
    const staff = await this.get(id);
    const today = dateIdInTz(await this.store.timeZone());
    const from = query.from ?? addDays(today, -((weekday(today) + 6) % 7));
    const to = query.to ?? addDays(from, 6);
    if (to < from) throw hairInvalid('Bitiş tarihi başlangıçtan önce olamaz.');
    const toExclusive = addDays(to, 1);
    const [shifts, timeOff, appointments] = await Promise.all([
      this.store.rows(TENANT_COLLECTION.hairShifts, { field: 'staffId', op: '==', value: id }),
      this.store.rows(TENANT_COLLECTION.hairTimeOff, { field: 'staffId', op: '==', value: id }),
      this.store.rows(TENANT_COLLECTION.hairAppointments, undefined, { field: 'date', from, to: toExclusive }),
    ]);
    const involves = (a: HairDoc) =>
      a['staffId'] === id || (Array.isArray(a['services']) && (a['services'] as HairDoc[]).some((s) => s['staffId'] === id));
    return {
      staff,
      shifts: shifts.filter((s) => str(s['date']) >= from && str(s['date']) <= to).sort(byField('date', 'startTime')),
      timeOff: timeOff
        .filter((t) => str(t['startDate']) <= to && str(t['endDate']) >= from)
        .sort(byField('startDate')),
      appointments: appointments.filter(involves).sort(byField('date', 'startTime')),
    };
  }

  // ── Shifts ──

  async listShifts(query: HairListQueryDto) {
    const actor = await this.store.actorOrThrow();
    const staffId = this.store.staffFilter(actor, 'hairStaff', query.staffId);
    const branch = this.store.branchFilter(actor, query.branchId);
    return this.store.list(TENANT_COLLECTION.hairShifts, {
      dateField: 'date',
      from: query.from,
      to: query.to ? addDays(query.to, 1) : undefined,
      equals: { staffId, branchId: branch.equals },
      anyOf: branch.anyOf ? { field: 'branchId', values: branch.anyOf } : undefined,
      orderBy: { field: 'date', dir: 'asc' },
      limit: query.limit ?? 200,
      cursor: query.cursor,
    });
  }

  async createShift(dto: CreateHairShiftDto) {
    const actor = await this.store.actorOrThrow();
    this.store.assertBranchAccess(actor, dto.branchId);
    assertWindow(dto.startTime, dto.endTime);
    const staff = await this.store.getOrThrow(TENANT_COLLECTION.hairStaff, dto.staffId, STAFF_NOT_FOUND);
    await this.store.getOrThrow(TENANT_COLLECTION.hairBranches, dto.branchId, 'Şube bulunamadı.');
    return this.store.create(TENANT_COLLECTION.hairShifts, 'hairShifts', {
      ...dto,
      staffName: `${str(staff['firstName'])} ${str(staff['lastName'])}`.trim(),
    });
  }

  async updateShift(id: string, dto: UpdateHairShiftDto) {
    const actor = await this.store.actorOrThrow();
    const current = await this.store.getOrThrow(TENANT_COLLECTION.hairShifts, id, SHIFT_NOT_FOUND);
    this.store.assertBranchAccess(actor, str(current['branchId']));
    if (dto.branchId) this.store.assertBranchAccess(actor, dto.branchId);
    assertWindow(dto.startTime ?? str(current['startTime']), dto.endTime ?? str(current['endTime']));
    if (dto.staffId) await this.store.getOrThrow(TENANT_COLLECTION.hairStaff, dto.staffId, STAFF_NOT_FOUND);
    return this.store.update(TENANT_COLLECTION.hairShifts, 'hairShifts', id, dto, SHIFT_NOT_FOUND);
  }

  async removeShift(id: string) {
    const actor = await this.store.actorOrThrow();
    const current = await this.store.getOrThrow(TENANT_COLLECTION.hairShifts, id, SHIFT_NOT_FOUND);
    this.store.assertBranchAccess(actor, str(current['branchId']));
    return this.store.softDelete(TENANT_COLLECTION.hairShifts, 'hairShifts', id, SHIFT_NOT_FOUND);
  }

  // ── Time off ──

  async listTimeOff(query: HairListQueryDto) {
    const actor = await this.store.actorOrThrow();
    const staffId = this.store.staffFilter(actor, 'hairLeaves', query.staffId);
    return this.store.list(TENANT_COLLECTION.hairTimeOff, {
      equals: { staffId, status: query.status },
      match: (item) =>
        (!query.from || str(item['endDate']) >= query.from) && (!query.to || str(item['startDate']) <= query.to),
      orderBy: { field: 'startDate', dir: 'desc' },
      limit: query.limit,
      cursor: query.cursor,
    });
  }

  async getTimeOff(id: string) {
    const actor = await this.store.actorOrThrow();
    const item = await this.store.getOrThrow(TENANT_COLLECTION.hairTimeOff, id, TIME_OFF_NOT_FOUND);
    this.store.staffFilter(actor, 'hairLeaves', str(item['staffId']));
    return item;
  }

  /** Staff with `own` scope may only request their own leave (pending); approvers record it approved. */
  async createTimeOff(dto: CreateHairTimeOffDto) {
    if (dto.startDate > dto.endDate) throw hairInvalid('İzin başlangıcı bitişten sonra olamaz.');
    const actor = await this.store.actorOrThrow();
    const staffId = dto.staffId ?? actor.staffId;
    if (!staffId) throw hairInvalid('staffId zorunludur.');
    this.store.staffFilter(actor, 'hairLeaves', staffId);
    const approver = APPROVER_ROLES.includes(actor.role);
    if (!approver && dto.status && dto.status !== 'pending') {
      throw hairForbidden('İzin onayı yalnızca yönetici veya müdür tarafından verilebilir.');
    }
    const staff = await this.store.getOrThrow(TENANT_COLLECTION.hairStaff, staffId, STAFF_NOT_FOUND);
    const status = approver ? (dto.status ?? 'approved') : 'pending';
    return this.store.create(TENANT_COLLECTION.hairTimeOff, 'hairTimeOff', {
      ...dto,
      staffId,
      staffName: `${str(staff['firstName'])} ${str(staff['lastName'])}`.trim(),
      status,
      ...(status !== 'pending' ? { decidedBy: this.store.userId(), decidedAt: new Date().toISOString() } : {}),
    });
  }

  async updateTimeOff(id: string, dto: UpdateHairTimeOffDto) {
    const current = await this.store.getOrThrow(TENANT_COLLECTION.hairTimeOff, id, TIME_OFF_NOT_FOUND);
    const startDate = dto.startDate ?? str(current['startDate']);
    const endDate = dto.endDate ?? str(current['endDate']);
    if (startDate > endDate) throw hairInvalid('İzin başlangıcı bitişten sonra olamaz.');
    const decided = dto.status && dto.status !== current['status'];
    return this.store.update(
      TENANT_COLLECTION.hairTimeOff,
      'hairTimeOff',
      id,
      {
        ...dto,
        ...(decided ? { decidedBy: this.store.userId(), decidedAt: new Date().toISOString() } : {}),
      },
      TIME_OFF_NOT_FOUND,
    );
  }

  // ── helpers ──

  private assertCanAssignRole(actor: HairActor, role: HairStaffRole) {
    if (actor.role !== 'admin' && (role === 'admin' || role === 'manager')) {
      throw hairForbidden('Yönetici veya müdür rolünü yalnızca yöneticiler atayabilir.');
    }
  }

  /** The salon must keep at least one active admin (the owner's card counts as one). */
  private async assertNotLastAdmin(staffId: string) {
    const admins = await this.store.rows(TENANT_COLLECTION.hairStaff, { field: 'role', op: '==', value: 'admin' });
    if (!admins.some((admin) => admin.id !== staffId && admin['active'] !== false)) {
      throw hairPrecondition('Salonda en az bir aktif yönetici kalmalıdır; son yöneticinin rolü değiştirilemez.');
    }
  }

  private async assertBranches(branchIds: string[]) {
    for (const branchId of branchIds) {
      const branch = await this.store.find(TENANT_COLLECTION.hairBranches, branchId);
      if (!branch) throw hairNotFound(`Şube bulunamadı: ${branchId}`);
    }
  }

  private async isOwnerUser(uid: string): Promise<boolean> {
    const profile = await this.users.findByUid(uid);
    return profile?.role === 'owner';
  }

  private async syncRole(uid: string, role: HairStaffRole) {
    const profile = await this.users.findByUid(uid);
    if (!profile || profile.tenantId !== this.store.tenantId() || profile.role === 'owner') return;
    const roleIds = [...(profile.roleIds ?? []).filter((roleId) => !HAIR_ROLE_IDS.has(roleId)), hairRoleId(role)];
    await this.users.updateProfile(uid, { roleIds, updatedAt: new Date().toISOString() });
  }

  private async syncActive(uid: string, active: boolean) {
    const profile = await this.users.findByUid(uid);
    if (!profile || profile.tenantId !== this.store.tenantId() || profile.role === 'owner') return;
    await this.users.updateProfile(uid, {
      status: active ? 'active' : 'inactive',
      updatedAt: new Date().toISOString(),
    });
    await this.store.auth.updateUser(uid, { disabled: !active }).catch((err) => this.logger.error(err));
    if (!active) await this.store.auth.revokeRefreshTokens(uid).catch((err) => this.logger.error(err));
  }
}

function asStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function assertWindow(start: string, end: string) {
  const s = parseClock(start);
  const e = parseClock(end);
  if (s === undefined || e === undefined || s >= e) {
    throw hairInvalid('Başlangıç saati bitişten önce olmalıdır.');
  }
}

function assertSchedule(entries: { startTime: string; endTime: string }[] | undefined) {
  for (const entry of entries ?? []) assertWindow(entry.startTime, entry.endTime);
}

function byField(...fields: string[]) {
  return (a: HairDoc, b: HairDoc) => {
    for (const field of fields) {
      const diff = str(a[field]).localeCompare(str(b[field]));
      if (diff) return diff;
    }
    return 0;
  };
}
