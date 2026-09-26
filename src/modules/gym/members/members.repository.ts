import { Injectable, Logger } from '@nestjs/common';
import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { FirebaseService } from '../../../shared/firebase/firebase.service';
import { TENANT_COLLECTION } from '../../../shared/firebase/firestore-path';
import { createBaseFields, isDeleted, touchBaseFields } from '../../../shared/firestore/base-document';
import { TenantContext } from '../../../shared/tenancy/tenant.context';
import { IdentityRepository } from '../../identity/identity.repository';
import { UserProfile } from '../../identity/entities/user-profile.entity';
import { gymCollection, listUndeleted } from '../shared/gym-collection';
import { CreateMemberDto, ListMembersQueryDto, UpdateMemberDto } from './member.dto';
import { GymMember } from './member.entity';

@Injectable()
export class MembersRepository {
  private readonly logger = new Logger(MembersRepository.name);

  constructor(
    private readonly firebase: FirebaseService,
    private readonly tenantContext: TenantContext,
    private readonly users: IdentityRepository,
  ) {}

  private collection() {
    return gymCollection(this.firebase, this.tenantContext, TENANT_COLLECTION.gymMembers);
  }

  async create(dto: CreateMemberDto): Promise<GymMember> {
    const store = this.tenantContext.getStore();
    let uid: string | undefined;
    try {
      const userRecord = await this.firebase.auth.createUser({
        email: dto.email,
        password: dto.password,
        displayName: dto.displayName,
      });
      uid = userRecord.uid;
      const now = new Date().toISOString();
      const profile: UserProfile = {
        uid,
        tenantId: store.tenantId,
        role: 'user',
        accountType: 'gym_member',
        modules: store.modules,
        email: dto.email.trim().toLowerCase(),
        displayName: dto.displayName.trim(),
        status: 'active',
        membershipStatus: dto.membershipStatus ?? 'trial',
        createdAt: now,
        updatedAt: now,
      };
      await this.users.createProfile(profile);
      await this.firebase.auth.setCustomUserClaims(uid, {
        tenantId: store.tenantId,
        role: 'user',
        accountType: 'gym_member',
        modules: store.modules,
      });
      const member = this.toMember(uid, dto, now);
      await this.collection().doc(uid).set(member);
      return member;
    } catch (error) {
      if (uid) {
        await this.users.hardDelete(uid).catch((err) => this.logger.error(err));
        await this.firebase.auth.deleteUser(uid).catch((err) => this.logger.error(err));
      }
      throw mapMemberAuthError(error);
    }
  }

  async getByIdOrThrow(id: string): Promise<GymMember> {
    const snapshot = await this.collection().doc(id).get();
    const member = snapshot.exists ? (snapshot.data() as GymMember) : null;
    if (!member || isDeleted(member)) {
      throw new AppException(ErrorCode.GYM_MEMBER_NOT_FOUND, 'Member not found');
    }
    return member;
  }

  async list(query: ListMembersQueryDto) {
    const term = (query.q ?? '').toLocaleLowerCase('tr');
    const items = await listUndeleted<GymMember>(this.collection());
    return items.filter((item) => {
      if (typeof query.archived === 'boolean' && item.isArchived !== query.archived) {
        return false;
      }
      if (!term) {
        return true;
      }
      return `${item.displayName} ${item.email} ${item.phone ?? ''} ${item.memberNumber}`
        .toLocaleLowerCase('tr')
        .includes(term);
    });
  }

  async update(id: string, dto: UpdateMemberDto): Promise<GymMember> {
    const current = await this.getByIdOrThrow(id);
    const now = new Date().toISOString();
    const updated: GymMember = {
      ...current,
      displayName: dto.displayName ?? current.displayName,
      phone: dto.phone !== undefined ? dto.phone : current.phone,
      gender: dto.gender ?? current.gender,
      birthDate: dto.birthDate !== undefined ? dto.birthDate : current.birthDate,
      membershipStatus: dto.membershipStatus ?? current.membershipStatus,
      packageLabel: dto.packageLabel !== undefined ? dto.packageLabel : current.packageLabel,
      packagePrice: dto.packagePrice !== undefined ? dto.packagePrice : current.packagePrice,
      membershipStartsAt:
        dto.membershipStartDate !== undefined ? dto.membershipStartDate : current.membershipStartsAt,
      membershipEndsAt: dto.membershipEndDate !== undefined ? dto.membershipEndDate : current.membershipEndsAt,
      notes: dto.notes !== undefined ? dto.notes : current.notes,
      memberNumber: dto.memberNumber ?? current.memberNumber,
      trainerId: dto.trainerId !== undefined ? dto.trainerId : current.trainerId,
      trainerName: dto.trainerName !== undefined ? dto.trainerName : current.trainerName,
      emergencyContactName:
        dto.emergencyContactName !== undefined ? dto.emergencyContactName : current.emergencyContactName,
      emergencyContactPhone:
        dto.emergencyContactPhone !== undefined ? dto.emergencyContactPhone : current.emergencyContactPhone,
      emergencyContactRelation:
        dto.emergencyContactRelation !== undefined
          ? dto.emergencyContactRelation
          : current.emergencyContactRelation,
      bloodGroup: dto.bloodGroup !== undefined ? dto.bloodGroup : current.bloodGroup,
      allergies: dto.allergies !== undefined ? dto.allergies : current.allergies,
      chronicDiseases: dto.chronicDiseases !== undefined ? dto.chronicDiseases : current.chronicDiseases,
      specialInfo: dto.specialInfo !== undefined ? dto.specialInfo : current.specialInfo,
      photoURL: dto.photoURL !== undefined ? dto.photoURL : current.photoURL,
      rfidCardNumber: dto.rfidCardNumber !== undefined ? dto.rfidCardNumber : current.rfidCardNumber,
      cardDepositFee: dto.cardDepositFee ?? current.cardDepositFee,
      cardDepositPaid: dto.cardDepositPaid ?? current.cardDepositPaid,
      branchId: dto.branchId !== undefined ? dto.branchId : current.branchId,
      branchName: dto.branchName !== undefined ? dto.branchName : current.branchName,
      isArchived: dto.isArchived ?? current.isArchived,
      archivedAt: dto.isArchived === true ? now : dto.isArchived === false ? null : current.archivedAt,
      ...touchBaseFields(this.tenantContext.getUserId(), now),
    };
    await this.collection().doc(id).set(updated);
    if (dto.displayName) {
      await this.users.updateProfile(id, { displayName: dto.displayName, updatedAt: now });
    }
    return updated;
  }

  async save(member: GymMember): Promise<GymMember> {
    const updated = { ...member, ...touchBaseFields(this.tenantContext.getUserId()) };
    await this.collection().doc(member.uid).set(updated);
    return updated;
  }

  async softDelete(id: string): Promise<void> {
    await this.getByIdOrThrow(id);
    await this.collection()
      .doc(id)
      .update({
        deletedAt: new Date().toISOString(),
        ...touchBaseFields(this.tenantContext.getUserId()),
      });
    await this.users.updateProfile(id, { status: 'inactive', updatedAt: new Date().toISOString() });
    await this.firebase.auth.updateUser(id, { disabled: true }).catch((err) => this.logger.error(err));
  }

  private toMember(uid: string, dto: CreateMemberDto, now: string): GymMember {
    const isActive = (dto.membershipStatus ?? 'trial') === 'active';
    return {
      ...createBaseFields(uid, this.tenantContext.getUserId(), now),
      uid,
      email: dto.email.trim().toLowerCase(),
      displayName: dto.displayName.trim(),
      photoURL: dto.photoURL ?? null,
      phone: dto.phone?.trim() || null,
      gender: dto.gender ?? 'unspecified',
      birthDate: dto.birthDate ?? null,
      membershipStatus: dto.membershipStatus ?? 'trial',
      membershipStartsAt: isActive ? dto.membershipStartDate ?? now : null,
      membershipEndsAt: isActive ? dto.membershipEndDate ?? null : null,
      packageLabel: isActive ? dto.packageLabel ?? null : null,
      packagePrice: dto.packagePrice ?? null,
      notes: dto.notes?.trim() || null,
      country: null,
      language: 'tr',
      walletBalance: 0,
      branchId: dto.branchId ?? null,
      branchName: dto.branchName ?? null,
      memberNumber: dto.memberNumber?.trim() || String(Math.floor(10000 + Math.random() * 90000)),
      trainerId: dto.trainerId ?? null,
      trainerName: dto.trainerName ?? null,
      emergencyContactName: dto.emergencyContactName?.trim() || null,
      emergencyContactPhone: dto.emergencyContactPhone?.trim() || null,
      emergencyContactRelation: dto.emergencyContactRelation?.trim() || null,
      bloodGroup: dto.bloodGroup ?? null,
      allergies: dto.allergies?.trim() || null,
      chronicDiseases: dto.chronicDiseases?.trim() || null,
      specialInfo: dto.specialInfo?.trim() || null,
      rfidCardNumber: dto.rfidCardNumber?.trim() || null,
      cardDepositFee: dto.cardDepositFee ?? 0,
      cardDepositPaid: dto.cardDepositPaid ?? false,
      isArchived: false,
      archivedAt: null,
    };
  }
}

function mapMemberAuthError(error: unknown): AppException {
  const record = error as { code?: string; errorInfo?: { code?: string } };
  const code = record.errorInfo?.code ?? record.code ?? '';
  if (code === 'auth/email-already-exists') {
    return new AppException(ErrorCode.VALIDATION_ERROR, 'Email is already registered');
  }
  if (error instanceof AppException) {
    return error;
  }
  return new AppException(ErrorCode.VALIDATION_ERROR, 'Member create failed');
}
