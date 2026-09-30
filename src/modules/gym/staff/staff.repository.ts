import { Injectable } from '@nestjs/common';
import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { FirebaseService } from '../../../shared/firebase/firebase.service';
import { TENANT_COLLECTION } from '../../../shared/firebase/firestore-path';
import {
  createBaseFields,
  isDeleted,
  omitUndefined,
  touchBaseFields,
} from '../../../shared/firestore/base-document';
import { TenantContext } from '../../../shared/tenancy/tenant.context';
import { gymCollection, listUndeleted } from '../shared/gym-collection';
import { CreateStaffDto, UpdateStaffDto } from './staff.dto';
import { GymStaff } from './staff.entity';

@Injectable()
export class StaffRepository {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly tenantContext: TenantContext,
  ) {}

  private collection() {
    return gymCollection(this.firebase, this.tenantContext, TENANT_COLLECTION.gymStaff);
  }

  async create(dto: CreateStaffDto): Promise<GymStaff> {
    const ref = this.collection().doc();
    const staff: GymStaff = {
      ...createBaseFields(ref.id, this.tenantContext.getUserId()),
      displayName: dto.displayName,
      email: dto.email.trim().toLowerCase(),
      phone: dto.phone ?? null,
      role: dto.role ?? 'trainer',
      title: dto.title ?? 'Kulüp Personeli',
      branchId: dto.branchId ?? null,
      branchName: dto.branchName ?? null,
      branchIds: dto.branchIds ?? (dto.branchId ? [dto.branchId] : []),
      branchNames: dto.branchNames ?? (dto.branchName ? [dto.branchName] : []),
      specialties: dto.specialties ?? [],
      customPermissions: dto.customPermissions ?? [],
      status: dto.status ?? 'active',
      hireDate: dto.hireDate ?? new Date().toISOString().slice(0, 10),
      emergencyContact: dto.emergencyContact ?? null,
      monthlySalary: dto.monthlySalary ?? 0,
      commissionRate: dto.commissionRate ?? 0,
      notes: dto.notes ?? null,
      avatarUrl: null,
    };
    await ref.set(staff);
    return staff;
  }

  async getByIdOrThrow(id: string): Promise<GymStaff> {
    const snapshot = await this.collection().doc(id).get();
    const staff = snapshot.exists ? (snapshot.data() as GymStaff) : null;
    if (!staff || isDeleted(staff)) {
      throw new AppException(ErrorCode.GYM_STAFF_NOT_FOUND, 'Staff not found');
    }
    return staff;
  }

  list() {
    return listUndeleted<GymStaff>(this.collection());
  }

  async update(id: string, dto: UpdateStaffDto): Promise<GymStaff> {
    const current = await this.getByIdOrThrow(id);
    const updated: GymStaff = {
      ...current,
      ...omitUndefined(dto),
      email: dto.email ? dto.email.trim().toLowerCase() : current.email,
      ...touchBaseFields(this.tenantContext.getUserId()),
    };
    await this.collection().doc(id).set(updated);
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
  }
}
