import { Injectable } from '@nestjs/common';
import { FirebaseService } from '../../shared/firebase/firebase.service';
import { ROOT_COLLECTION } from '../../shared/firebase/firestore-path';
import { createBaseFields } from '../../shared/firestore/base-document';
import { ProductModule } from '../../shared/authorization/constants';
import { TenantDocument } from './entities/tenant.entity';
import { AppException } from '../../shared/errors/app.exception';
import { ErrorCode } from '../../shared/errors/error-codes';

@Injectable()
export class TenantRepository {
  constructor(private readonly firebase: FirebaseService) {}

  private collection() {
    return this.firebase.db.collection(ROOT_COLLECTION.tenants);
  }

  async create(input: {
    name: string;
    ownerUid: string;
    modules: ProductModule[];
  }): Promise<TenantDocument> {
    const ref = this.collection().doc();
    const tenant: TenantDocument = {
      ...createBaseFields(ref.id, input.ownerUid),
      name: input.name,
      ownerUid: input.ownerUid,
      modules: input.modules,
      status: 'active',
    };
    await ref.set(tenant);
    return tenant;
  }

  async findById(id: string): Promise<TenantDocument | null> {
    const snapshot = await this.collection().doc(id).get();
    if (!snapshot.exists) {
      return null;
    }
    return snapshot.data() as TenantDocument;
  }

  async getByIdOrThrow(id: string): Promise<TenantDocument> {
    const tenant = await this.findById(id);
    if (!tenant || tenant.deletedAt) {
      throw new AppException(ErrorCode.TENANT_NOT_FOUND, 'Tenant not found');
    }
    return tenant;
  }

  async hardDelete(id: string): Promise<void> {
    await this.collection().doc(id).delete();
  }
}
