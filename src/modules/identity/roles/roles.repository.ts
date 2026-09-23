import { Injectable } from '@nestjs/common';
import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { FirebaseService } from '../../../shared/firebase/firebase.service';
import { TENANT_COLLECTION, tenantCollectionPath } from '../../../shared/firebase/firestore-path';
import { createBaseFields, isDeleted, touchBaseFields } from '../../../shared/firestore/base-document';
import { PermissionMap } from '../../../shared/authorization/permissions';
import { TenantContext } from '../../../shared/tenancy/tenant.context';
import { Role } from './role.entity';

export interface RoleFields {
  name: string;
  description: string | null;
  permissions: PermissionMap;
}

@Injectable()
export class RolesRepository {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly tenantContext: TenantContext,
  ) {}

  private collection() {
    return this.firebase.db.collection(
      tenantCollectionPath(this.tenantContext.getTenantId(), TENANT_COLLECTION.roles),
    );
  }

  async list(): Promise<Role[]> {
    const snapshot = await this.collection().where('deletedAt', '==', null).get();
    return snapshot.docs
      .map((doc) => doc.data() as Role)
      .sort((left, right) => left.name.localeCompare(right.name, 'tr'));
  }

  async findByIds(ids: string[]): Promise<Role[]> {
    const unique = [...new Set(ids.filter(Boolean))];
    if (unique.length === 0) {
      return [];
    }
    const snapshots = await this.firebase.db.getAll(...unique.map((id) => this.collection().doc(id)));
    return snapshots
      .filter((snapshot) => snapshot.exists)
      .map((snapshot) => snapshot.data() as Role)
      .filter((role) => !isDeleted(role));
  }

  async getByIdOrThrow(id: string): Promise<Role> {
    const snapshot = await this.collection().doc(id).get();
    const role = snapshot.exists ? (snapshot.data() as Role) : null;
    if (!role || isDeleted(role)) {
      throw new AppException(ErrorCode.ROLE_NOT_FOUND, 'Role not found');
    }
    return role;
  }

  async create(fields: RoleFields): Promise<Role> {
    const ref = this.collection().doc();
    const role: Role = {
      ...createBaseFields(ref.id, this.tenantContext.getUserId()),
      ...fields,
    };
    await ref.set(role);
    return role;
  }

  async update(id: string, fields: Partial<RoleFields>): Promise<Role> {
    const current = await this.getByIdOrThrow(id);
    const updated: Role = {
      ...current,
      ...fields,
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
