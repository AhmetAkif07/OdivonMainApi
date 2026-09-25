import { Injectable } from '@nestjs/common';
import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { FirebaseService } from '../../../shared/firebase/firebase.service';
import { TENANT_COLLECTION } from '../../../shared/firebase/firestore-path';
import { createBaseFields, omitUndefined, touchBaseFields } from '../../../shared/firestore/base-document';
import { TenantContext } from '../../../shared/tenancy/tenant.context';
import { gymCollection } from '../shared/gym-collection';
import { PatchGymInfoDto, UpsertGymInfoDto } from './gym-info.dto';
import { GymInfo } from './gym-info.entity';

@Injectable()
export class GymInfoRepository {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly tenantContext: TenantContext,
  ) {}

  private doc() {
    const tenantId = this.tenantContext.getTenantId();
    return gymCollection(this.firebase, this.tenantContext, TENANT_COLLECTION.gymInfo).doc(tenantId);
  }

  async find(): Promise<GymInfo | null> {
    const snapshot = await this.doc().get();
    return snapshot.exists ? (snapshot.data() as GymInfo) : null;
  }

  async getOrThrow(): Promise<GymInfo> {
    const info = await this.find();
    if (!info) {
      throw new AppException(ErrorCode.GYM_INFO_NOT_FOUND, 'Gym info not found');
    }
    return info;
  }

  async upsert(dto: UpsertGymInfoDto | PatchGymInfoDto): Promise<GymInfo> {
    const current = await this.find();
    const userId = this.tenantContext.getUserId();
    const tenantId = this.tenantContext.getTenantId();
    const base = current ?? createBaseFields(tenantId, userId);
    const info: GymInfo = {
      ...base,
      ...touchBaseFields(userId),
      businessName: dto.businessName ?? current?.businessName ?? '',
      businessType: dto.businessType ?? current?.businessType ?? 'company',
      taxId: dto.taxId !== undefined ? dto.taxId : (current?.taxId ?? null),
      businessEmail: dto.businessEmail ?? current?.businessEmail ?? '',
      businessPhone: dto.businessPhone ?? current?.businessPhone ?? '',
      website: dto.website !== undefined ? dto.website : (current?.website ?? null),
      logo: dto.logo !== undefined ? dto.logo : (current?.logo ?? null),
      trialDays: dto.trialDays ?? current?.trialDays ?? 14,
      defaultPackageId: dto.defaultPackageId !== undefined ? dto.defaultPackageId : (current?.defaultPackageId ?? null),
      maxFreezeDays: dto.maxFreezeDays ?? current?.maxFreezeDays ?? 0,
      cancellationPolicy: dto.cancellationPolicy !== undefined ? dto.cancellationPolicy : (current?.cancellationPolicy ?? null),
      termsAndConditions:
        dto.termsAndConditions !== undefined ? dto.termsAndConditions : (current?.termsAndConditions ?? null),
      features: dto.features ?? current?.features ?? [],
      city: dto.city !== undefined ? dto.city : (current?.city ?? null),
      address: dto.address !== undefined ? dto.address : (current?.address ?? null),
      openTime: dto.openTime !== undefined ? dto.openTime : (current?.openTime ?? null),
      closeTime: dto.closeTime !== undefined ? dto.closeTime : (current?.closeTime ?? null),
      workingDays: dto.workingDays ?? current?.workingDays ?? [1, 2, 3, 4, 5, 6, 0],
    };
    await this.doc().set(omitUndefined(info) as GymInfo);
    return info;
  }
}
