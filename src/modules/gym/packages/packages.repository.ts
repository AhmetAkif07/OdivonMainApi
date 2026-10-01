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
import { CreatePackageDto, ListPackagesQueryDto, UpdatePackageDto } from './package.dto';
import { GymPackage } from './package.entity';

@Injectable()
export class PackagesRepository {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly tenantContext: TenantContext,
  ) {}

  private collection() {
    return gymCollection(this.firebase, this.tenantContext, TENANT_COLLECTION.gymPackages);
  }

  async create(dto: CreatePackageDto): Promise<GymPackage> {
    const ref = this.collection().doc();
    const item: GymPackage = {
      ...createBaseFields(ref.id, this.tenantContext.getUserId()),
      name: dto.name,
      category: dto.category ?? 'Genel Fitness',
      durationDays: dto.durationDays,
      durationType: dto.durationType ?? 'day',
      durationValue: dto.durationValue ?? dto.durationDays,
      price: dto.price,
      description: dto.description ?? '',
      features: dto.features ?? [],
      maxFreeze: dto.maxFreeze ?? 0,
      trialEligible: dto.trialEligible ?? false,
      allowedDays: dto.allowedDays ?? [1, 2, 3, 4, 5, 6, 0],
      checkInStartTime: dto.checkInStartTime ?? '06:00',
      checkInEndTime: dto.checkInEndTime ?? '23:00',
      sessionCount: dto.sessionCount ?? null,
      classCredits: dto.classCredits ?? null,
      isUnlimitedSessions: dto.isUnlimitedSessions ?? false,
      barcode: dto.barcode ?? '',
      isHidden: dto.isHidden ?? false,
      status: dto.status ?? 'active',
      branchId: null,
      branchName: null,
    };
    await ref.set(item);
    return item;
  }

  async getByIdOrThrow(id: string): Promise<GymPackage> {
    const snapshot = await this.collection().doc(id).get();
    const item = snapshot.exists ? (snapshot.data() as GymPackage) : null;
    if (!item || isDeleted(item)) {
      throw new AppException(ErrorCode.GYM_PACKAGE_NOT_FOUND, 'Package not found');
    }
    return item;
  }

  async list(query: ListPackagesQueryDto) {
    const items = await listUndeleted<GymPackage>(this.collection());
    return items.filter((item) => {
      if (query.activeOnly) {
        return item.status === 'active';
      }
      if (query.status) {
        return item.status === query.status;
      }
      return true;
    });
  }

  async update(id: string, dto: UpdatePackageDto): Promise<GymPackage> {
    const current = await this.getByIdOrThrow(id);
    const updated: GymPackage = {
      ...current,
      ...omitUndefined(dto),
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
