import { Injectable } from '@nestjs/common';
import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { FirebaseService } from '../../../shared/firebase/firebase.service';
import { TENANT_COLLECTION, tenantCollectionPath } from '../../../shared/firebase/firestore-path';
import {
  createBaseFields,
  isDeleted,
  touchBaseFields,
} from '../../../shared/firestore/base-document';
import { TenantContext } from '../../../shared/tenancy/tenant.context';
import { GroomingStaff } from './entities/grooming-appointment.entity';

@Injectable()
export class GroomingStaffRepository {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly tenantContext: TenantContext,
  ) {}

  private collection() {
    return this.firebase.db.collection(
      tenantCollectionPath(this.tenantContext.getTenantId(), TENANT_COLLECTION.groomingStaff),
    );
  }

  async list(): Promise<GroomingStaff[]> {
    const snapshot = await this.collection().get();
    return snapshot.docs
      .map((doc) => doc.data() as GroomingStaff)
      .filter((item) => !isDeleted(item))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }

  async findById(id: string): Promise<GroomingStaff | null> {
    const snapshot = await this.collection().doc(id).get();
    if (!snapshot.exists) return null;
    const item = snapshot.data() as GroomingStaff;
    return isDeleted(item) ? null : item;
  }

  async getByIdOrThrow(id: string): Promise<GroomingStaff> {
    const item = await this.findById(id);
    if (!item) {
      throw new AppException(ErrorCode.GROOMING_STAFF_NOT_FOUND, 'Kuaför personeli bulunamadı');
    }
    return item;
  }

  async create(data: Omit<GroomingStaff, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy' | 'deletedAt'>): Promise<GroomingStaff> {
    const ref = this.collection().doc();
    const item: GroomingStaff = {
      ...createBaseFields(ref.id, this.tenantContext.getUserId()),
      ...data,
    };
    await ref.set(item);
    return item;
  }

  async update(id: string, updateData: Partial<GroomingStaff>): Promise<GroomingStaff> {
    const current = await this.getByIdOrThrow(id);
    const updated: GroomingStaff = {
      ...current,
      ...touchBaseFields(this.tenantContext.getUserId()),
      ...updateData,
    };
    await this.collection().doc(id).set(updated);
    return updated;
  }

  async softDelete(id: string): Promise<void> {
    await this.getByIdOrThrow(id);
    await this.collection().doc(id).update({
      deletedAt: new Date().toISOString(),
      ...touchBaseFields(this.tenantContext.getUserId()),
    });
  }
}