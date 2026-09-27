import { randomBytes } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { TENANT_COLLECTION } from '../../../shared/firebase/firestore-path';
import { TenantContext } from '../../../shared/tenancy/tenant.context';
import { IdentityRepository } from '../../identity/identity.repository';
import { UserProfile } from '../../identity/entities/user-profile.entity';
import { DEFAULT_STAFF_COLOR } from '../core/spa-core.service';
import { spaForbidden, spaInvalid, spaNotFound, spaPrecondition } from '../shared/spa-errors';
import { SPA_STAFF_ROLES, spaRoleId, SpaStaffRole } from '../shared/spa-roles';
import { SpaDoc, SpaStore } from '../shared/spa-store';
import {
  CreateSpaLeaveDto,
  CreateSpaTaskDto,
  InviteSpaStaffDto,
  UpdateSpaLeaveDto,
  UpdateSpaStaffDto,
  UpdateSpaTaskDto,
} from './staff.dto';

const STAFF_NOT_FOUND = 'Personel bulunamadı.';
const LEAVE_NOT_FOUND = 'İzin kaydı bulunamadı.';
const TASK_NOT_FOUND = 'Görev bulunamadı.';
const SPA_ROLE_IDS = new Set(SPA_STAFF_ROLES.map(spaRoleId));

@Injectable()
export class SpaStaffService {
  private readonly logger = new Logger(SpaStaffService.name);

  constructor(
    private readonly store: SpaStore,
    private readonly tenantContext: TenantContext,
    private readonly users: IdentityRepository,
  ) {}

  list() {
    return this.store.list(TENANT_COLLECTION.spaStaff, { orderBy: { field: 'ad', dir: 'asc' } });
  }

  get(id: string) {
    return this.store.getOrThrow(TENANT_COLLECTION.spaStaff, id, STAFF_NOT_FOUND);
  }

  updateProfile(id: string, dto: UpdateSpaStaffDto) {
    return this.store.update(TENANT_COLLECTION.spaStaff, 'staff', id, dto, STAFF_NOT_FOUND);
  }

  /** Creates the Auth user, MainApi profile and staff card; returns a reset link for the invitee. */
  async invite(dto: InviteSpaStaffDto) {
    const current = this.tenantContext.getStore();
    const email = dto.email.trim().toLowerCase();
    const ad = dto.ad.trim();
    let uid: string | undefined;
    let profileCreated = false;

    try {
      // Never shown to anyone — the invitee sets their own password through the reset link.
      const userRecord = await this.store.auth.createUser({
        email,
        password: randomBytes(24).toString('base64url'),
        displayName: ad,
      });
      uid = userRecord.uid;
      const now = new Date().toISOString();
      const profile: UserProfile = {
        uid,
        tenantId: current.tenantId,
        role: 'user',
        accountType: 'staff',
        modules: current.modules,
        email,
        displayName: ad,
        roleIds: [spaRoleId(dto.role)],
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
      await this.store.create(
        TENANT_COLLECTION.spaStaff,
        'staff',
        {
          ad,
          email,
          role: dto.role,
          uzmanliklar: [],
          primOraniVarsayilan: 0,
          renk: DEFAULT_STAFF_COLOR,
          active: true,
        },
        uid,
      );
      const resetLink = await this.store.auth.generatePasswordResetLink(email);
      return { staffId: uid, resetLink };
    } catch (error) {
      if (uid) {
        if (profileCreated) await this.users.hardDelete(uid).catch((err) => this.logger.error(err));
        await this.store.auth.deleteUser(uid).catch((err) => this.logger.error(err));
      }
      const info = error as { code?: string; errorInfo?: { code?: string } };
      if ((info?.errorInfo?.code ?? info?.code) === 'auth/email-already-exists') {
        throw spaPrecondition('Bu e-posta adresiyle kayıtlı bir kullanıcı zaten var.');
      }
      throw error;
    }
  }

  async setRole(staffId: string, role: SpaStaffRole) {
    const staff = await this.get(staffId);
    const profile = await this.manageableProfile(staffId);
    if (role !== 'admin') await this.assertNotLastActiveAdmin(staffId, staff);

    const roleIds = [
      ...(profile.roleIds ?? []).filter((id) => !SPA_ROLE_IDS.has(id)),
      spaRoleId(role),
    ];
    await this.users.updateProfile(staffId, { roleIds, updatedAt: new Date().toISOString() });
    await this.store.doc(TENANT_COLLECTION.spaStaff, staffId).update({
      role,
      updatedAt: new Date().toISOString(),
      updatedBy: this.store.userId(),
    });
    await this.store.audit('staff', 'callable', staffId, { role: staff['role'] }, { role });
    return { success: true };
  }

  async deactivate(staffId: string) {
    if (staffId === this.store.userId())
      throw spaPrecondition('Kendi hesabınızı pasifleştiremezsiniz.');
    const staff = await this.get(staffId);
    await this.manageableProfile(staffId);
    await this.assertNotLastActiveAdmin(staffId, staff);

    await this.store.auth.updateUser(staffId, { disabled: true });
    await this.store.auth.revokeRefreshTokens(staffId);
    await this.users.updateProfile(staffId, {
      status: 'inactive',
      updatedAt: new Date().toISOString(),
    });
    await this.store.doc(TENANT_COLLECTION.spaStaff, staffId).update({
      active: false,
      updatedAt: new Date().toISOString(),
      updatedBy: this.store.userId(),
    });
    await this.store.audit('staff', 'callable', staffId, { active: true }, { active: false });
    return { success: true };
  }

  // ---- Leaves ----

  listLeaves(staffId?: string, limit?: number) {
    return this.store.list(TENANT_COLLECTION.spaStaffLeaves, {
      equals: { staffId },
      orderBy: { field: 'startDate', dir: 'desc' },
      limit,
    });
  }

  /** Admin/reception may record any leave; other staff may only request their own (pending). */
  async createLeave(dto: CreateSpaLeaveDto) {
    assertDateOrder(dto.startDate, dto.endDate);
    const role = await this.store.currentRole();
    const manager = role === 'admin' || role === 'reception';
    if (!manager && dto.staffId !== this.store.userId()) {
      throw spaForbidden('Sadece kendi izninizi talep edebilirsiniz.');
    }
    if (manager && dto.status === 'reddedildi') {
      throw spaInvalid('Yeni izin kaydı reddedilmiş olarak oluşturulamaz.');
    }
    await this.get(dto.staffId);
    return this.store.create(TENANT_COLLECTION.spaStaffLeaves, 'staffLeaves', {
      ...dto,
      status: manager ? (dto.status ?? 'onaylandi') : 'beklemede',
    });
  }

  async updateLeave(id: string, dto: UpdateSpaLeaveDto) {
    const current = await this.store.getOrThrow(
      TENANT_COLLECTION.spaStaffLeaves,
      id,
      LEAVE_NOT_FOUND,
    );
    assertDateOrder(
      dto.startDate ?? String(current['startDate']),
      dto.endDate ?? String(current['endDate']),
    );
    return this.store.update(
      TENANT_COLLECTION.spaStaffLeaves,
      'staffLeaves',
      id,
      dto,
      LEAVE_NOT_FOUND,
    );
  }

  removeLeave(id: string) {
    return this.store.softDelete(
      TENANT_COLLECTION.spaStaffLeaves,
      'staffLeaves',
      id,
      LEAVE_NOT_FOUND,
    );
  }

  // ---- Tasks ----

  listTasks(staffId?: string, limit?: number) {
    return this.store.list(TENANT_COLLECTION.spaTasks, {
      equals: { staffId },
      orderBy: { field: 'createdAt', dir: 'desc' },
      limit,
    });
  }

  createTask(dto: CreateSpaTaskDto) {
    return this.store.create(TENANT_COLLECTION.spaTasks, 'tasks', {
      ...dto,
      status: dto.status ?? 'acik',
      priority: dto.priority ?? 'normal',
    });
  }

  /** Therapists may only update tasks assigned to them. */
  async updateTask(id: string, dto: UpdateSpaTaskDto) {
    const role = await this.store.currentRole();
    if (role !== 'admin' && role !== 'reception') {
      const task = await this.store.getOrThrow(TENANT_COLLECTION.spaTasks, id, TASK_NOT_FOUND);
      if (task['staffId'] !== this.store.userId()) {
        throw spaForbidden('Sadece size atanan görevleri güncelleyebilirsiniz.');
      }
    }
    return this.store.update(TENANT_COLLECTION.spaTasks, 'tasks', id, dto, TASK_NOT_FOUND);
  }

  removeTask(id: string) {
    return this.store.softDelete(TENANT_COLLECTION.spaTasks, 'tasks', id, TASK_NOT_FOUND);
  }

  // ---- helpers ----

  private async manageableProfile(uid: string): Promise<UserProfile> {
    const profile = await this.users.findByUid(uid);
    if (!profile || profile.tenantId !== this.store.tenantId()) throw spaNotFound(STAFF_NOT_FOUND);
    if (profile.role === 'owner') {
      throw spaForbidden('İşletme sahibinin rolü değiştirilemez veya pasifleştirilemez.');
    }
    return profile;
  }

  /** "Son aktif yöneticinin silinmesi/rol düşürülmesi engellenir." */
  private async assertNotLastActiveAdmin(staffId: string, staff: SpaDoc) {
    if (staff['role'] !== 'admin' || staff['active'] === false) return;
    const admins = await this.store.list(TENANT_COLLECTION.spaStaff, {
      equals: { role: 'admin', active: true },
      orderBy: { field: 'ad', dir: 'asc' },
    });
    if (admins.every((admin) => admin.id === staffId)) {
      throw spaPrecondition('Son aktif yönetici silinemez veya rolü düşürülemez.');
    }
  }
}

function assertDateOrder(start: string, end: string) {
  if (Date.parse(start) > Date.parse(end)) {
    throw spaInvalid('İzin başlangıcı bitişten sonra olamaz.');
  }
}
