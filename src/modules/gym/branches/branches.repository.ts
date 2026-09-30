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
import { CreateBranchDto, UpdateBranchDto } from './branch.dto';
import { GymBranch, OpeningHours } from './branch.entity';

@Injectable()
export class BranchesRepository {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly tenantContext: TenantContext,
  ) {}

  private collection() {
    return gymCollection(this.firebase, this.tenantContext, TENANT_COLLECTION.gymBranches);
  }

  async create(dto: CreateBranchDto): Promise<GymBranch> {
    const ref = this.collection().doc();
    const branch: GymBranch = {
      ...createBaseFields(ref.id, this.tenantContext.getUserId()),
      name: dto.name,
      logoUrl: dto.logoUrl ?? null,
      address: dto.address,
      city: dto.city,
      postalCode: dto.postalCode ?? null,
      phone: dto.phone,
      email: dto.email ?? '',
      website: dto.website ?? null,
      capacity: dto.capacity,
      currentOccupancy: 0,
      openingHours: plainHours(dto.openingHours) ?? [],
      openDays: dto.openDays ?? [1, 2, 3, 4, 5, 6, 0],
      features: dto.features ?? [],
      status: dto.status ?? 'active',
      managerName: dto.managerName ?? null,
    };
    await ref.set(branch);
    return branch;
  }

  async getByIdOrThrow(id: string): Promise<GymBranch> {
    const snapshot = await this.collection().doc(id).get();
    const branch = snapshot.exists ? (snapshot.data() as GymBranch) : null;
    if (!branch || isDeleted(branch)) {
      throw new AppException(ErrorCode.GYM_BRANCH_NOT_FOUND, 'Branch not found');
    }
    return branch;
  }

  list() {
    return listUndeleted<GymBranch>(this.collection());
  }

  async update(id: string, dto: UpdateBranchDto): Promise<GymBranch> {
    const current = await this.getByIdOrThrow(id);
    const updated: GymBranch = {
      ...current,
      ...omitUndefined({ ...dto, openingHours: plainHours(dto.openingHours) }),
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

/**
 * The validation pipe turns nested items into `OpeningHoursDto` instances; Firestore refuses objects
 * with a class prototype (the write fails with 500), so store plain copies.
 */
function plainHours(hours: OpeningHours[] | undefined): OpeningHours[] | undefined {
  return hours?.map(({ day, open, close, closed }) => ({ day, open, close, closed }));
}
