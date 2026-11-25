import { randomBytes } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { AppException } from '../../shared/errors/app.exception';
import { ErrorCode } from '../../shared/errors/error-codes';
import { FirebaseService } from '../../shared/firebase/firebase.service';
import { TENANT_COLLECTION, tenantCollectionPath } from '../../shared/firebase/firestore-path';
import { createBaseFields, isDeleted, touchBaseFields } from '../../shared/firestore/base-document';
import { MailService } from '../../shared/mail/mail.service';
import { TenantContext } from '../../shared/tenancy/tenant.context';
import { UserProfile } from '../identity/entities/user-profile.entity';
import { IdentityRepository } from '../identity/identity.repository';
import { Role } from '../identity/roles/role.entity';
import { TenantService } from '../tenant/tenant.service';
import { DIET_ROLE_TEMPLATES } from './diet.constants';
import { InviteDietStaffDto, UpdateDietStaffDto } from './diet.dto';

export type DietStaffRoleKey = (typeof DIET_ROLE_TEMPLATES)[number]['key'];
export const DIET_STAFF_ROLE_KEYS = DIET_ROLE_TEMPLATES.map((t) => t.key) as DietStaffRoleKey[];

export interface DietStaffMember {
  uid: string;
  displayName: string;
  email: string;
  /** `owner` is the clinic manager; everyone else is staff with a diet role. */
  isOwner: boolean;
  roleKey: DietStaffRoleKey | null;
  roleLabel: string;
  status: 'active' | 'inactive';
  isMe: boolean;
  createdAt: string;
}

/**
 * Clinic team for OdivonDiet. The manager invites a dietitian, assistant or receptionist by
 * e-mail: the account is created with a random password and the invitee sets their own through
 * the set-password link (no password is ever chosen or seen by the manager). Diet role templates
 * are stored as tenant roles under their template key the first time they are used.
 */
@Injectable()
export class DietStaffService {
  private readonly logger = new Logger(DietStaffService.name);

  constructor(
    private readonly firebase: FirebaseService,
    private readonly tenant: TenantContext,
    private readonly users: IdentityRepository,
    private readonly tenants: TenantService,
    private readonly mail: MailService,
  ) {}

  async list(): Promise<DietStaffMember[]> {
    const me = this.tenant.getUserId();
    const profiles = await this.users.listByCurrentTenant();
    return profiles
      .filter((p) => p.accountType !== 'diet_member' && p.accountType !== 'gym_member')
      .map((p) => this.toMember(p, me))
      .sort((a, b) => Number(b.isOwner) - Number(a.isOwner) || a.displayName.localeCompare(b.displayName, 'tr'));
  }

  async invite(dto: InviteDietStaffDto) {
    const store = this.tenant.getStore();
    const email = dto.email.trim().toLowerCase();
    const displayName = dto.displayName.trim();
    await this.ensureRole(dto.role);

    let uid: string | undefined;
    let profileCreated = false;
    const now = new Date().toISOString();
    let profile: UserProfile;
    try {
      const record = await this.firebase.auth.createUser({
        email,
        password: randomBytes(24).toString('base64url'),
        displayName,
        emailVerified: true,
      });
      uid = record.uid;
      profile = {
        uid,
        tenantId: store.tenantId,
        role: 'user',
        accountType: 'staff',
        modules: store.modules,
        email,
        displayName,
        roleIds: [dto.role],
        status: 'active',
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      };
      await this.users.createProfile(profile);
      profileCreated = true;
      await this.firebase.auth.setCustomUserClaims(uid, { tenantId: store.tenantId, role: 'user', modules: store.modules });
    } catch (error) {
      if (uid) {
        if (profileCreated) await this.users.hardDelete(uid).catch((err) => this.logger.error(err));
        await this.firebase.auth.deleteUser(uid).catch((err) => this.logger.error(err));
      }
      const info = error as { code?: string; errorInfo?: { code?: string } };
      if ((info?.errorInfo?.code ?? info?.code) === 'auth/email-already-exists') {
        throw new AppException(ErrorCode.DIET_PORTAL_CONFLICT, 'Bu e-posta adresiyle kayıtlı bir Odivon hesabı zaten var.');
      }
      throw error;
    }
    const setPasswordLink = await this.firebase.auth.generatePasswordResetLink(email);
    const emailSent = await this.sendInvite(email, displayName, setPasswordLink);
    return { staff: this.toMember(profile, store.userId), emailSent, setPasswordLink };
  }

  async resendInvite(uid: string) {
    const profile = await this.manageable(uid);
    const setPasswordLink = await this.firebase.auth.generatePasswordResetLink(profile.email);
    const emailSent = await this.sendInvite(profile.email, profile.displayName ?? profile.email, setPasswordLink);
    return { staff: this.toMember(profile, this.tenant.getUserId()), emailSent, setPasswordLink };
  }

  async update(uid: string, dto: UpdateDietStaffDto) {
    const profile = await this.manageable(uid);
    const patch: Partial<UserProfile> = { updatedAt: new Date().toISOString() };
    if (dto.role) {
      await this.ensureRole(dto.role);
      // Keep roles of other products; replace only the diet role.
      patch.roleIds = [...(profile.roleIds ?? []).filter((id) => !DIET_STAFF_ROLE_KEYS.includes(id as DietStaffRoleKey)), dto.role];
    }
    if (dto.displayName?.trim()) {
      patch.displayName = dto.displayName.trim();
      await this.firebase.auth.updateUser(uid, { displayName: patch.displayName });
    }
    if (dto.status) {
      patch.status = dto.status;
      await this.firebase.auth.updateUser(uid, { disabled: dto.status === 'inactive' });
      if (dto.status === 'inactive') await this.firebase.auth.revokeRefreshTokens(uid).catch((err) => this.logger.error(err));
    }
    await this.users.updateProfile(uid, patch);
    return this.toMember({ ...profile, ...patch }, this.tenant.getUserId());
  }

  /** A staff profile of this tenant that the manager may change (never the owner or themselves). */
  private async manageable(uid: string): Promise<UserProfile> {
    const store = this.tenant.getStore();
    const profile = await this.users.findByUid(uid);
    if (!profile || profile.tenantId !== store.tenantId || profile.accountType === 'diet_member' || profile.accountType === 'gym_member') {
      throw new AppException(ErrorCode.USER_NOT_FOUND, 'Personel bulunamadı.');
    }
    if (profile.role === 'owner' || uid === store.userId) {
      throw new AppException(ErrorCode.FORBIDDEN_ROLE, 'Klinik yöneticisinin hesabı buradan değiştirilemez.');
    }
    return profile;
  }

  private async ensureRole(key: DietStaffRoleKey): Promise<void> {
    const template = DIET_ROLE_TEMPLATES.find((t) => t.key === key);
    if (!template) throw new AppException(ErrorCode.ROLE_NOT_FOUND, 'Rol bulunamadı.');
    const ref = this.firebase.db.collection(tenantCollectionPath(this.tenant.getTenantId(), TENANT_COLLECTION.roles)).doc(key);
    const snapshot = await ref.get();
    const current = snapshot.exists ? (snapshot.data() as Role) : null;
    if (current && !isDeleted(current)) return;
    const userId = this.tenant.getUserId();
    const role: Role = {
      ...(current ?? createBaseFields(key, userId)),
      ...touchBaseFields(userId),
      id: key,
      deletedAt: null,
      name: template.label,
      description: 'OdivonDiet rol şablonu',
      permissions: JSON.parse(JSON.stringify(template.permissions)),
    };
    await ref.set(role);
  }

  private async sendInvite(to: string, displayName: string, setPasswordLink: string): Promise<boolean> {
    try {
      const tenant = await this.tenants.getById(this.tenant.getTenantId());
      return await this.mail.sendStaffInvite({ module: 'diet', to, displayName, tenantName: tenant.name, setPasswordLink });
    } catch (error) {
      this.logger.error(error);
      return false;
    }
  }

  private toMember(profile: UserProfile, me: string): DietStaffMember {
    const roleKey = (profile.roleIds ?? []).find((id): id is DietStaffRoleKey => DIET_STAFF_ROLE_KEYS.includes(id as DietStaffRoleKey)) ?? null;
    const isOwner = profile.role === 'owner';
    return {
      uid: profile.uid,
      displayName: profile.displayName?.trim() || profile.email,
      email: profile.email,
      isOwner,
      roleKey,
      roleLabel: isOwner ? 'Klinik Yöneticisi' : (DIET_ROLE_TEMPLATES.find((t) => t.key === roleKey)?.label ?? 'Rol atanmamış'),
      status: profile.status === 'inactive' ? 'inactive' : 'active',
      isMe: profile.uid === me,
      createdAt: profile.createdAt,
    };
  }
}
