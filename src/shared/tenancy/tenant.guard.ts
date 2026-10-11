import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { ProductModule, UserRole } from '../authorization/constants';
import {
  fullPermissionMap,
  mergePermissionMaps,
  normalizePermissionMap,
  PermissionMap,
} from '../authorization/permissions';
import { AppException } from '../errors/app.exception';
import { ErrorCode } from '../errors/error-codes';
import { FirebaseService } from '../firebase/firebase.service';
import {
  ROOT_COLLECTION,
  TENANT_COLLECTION,
  tenantCollectionPath,
} from '../firebase/firestore-path';
import { TenantContext, TenantStore, RequestWithTenant } from './tenant.context';
import { getDecodedToken } from '../auth/firebase-auth.guard';

interface UserProfileDoc {
  tenantId: string;
  role: UserRole;
  modules: ProductModule[];
  email: string;
  status: string;
  roleIds?: string[];
  accountType?: 'gym_member' | 'staff';
  displayName?: string | null;
  phone?: string | null;
}

interface RoleDoc {
  permissions?: Record<string, unknown>;
  deletedAt?: string | null;
}

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly tenantContext: TenantContext,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & RequestWithTenant>();
    const decoded = getDecodedToken(request);
    const snapshot = await this.firebase.db
      .collection(ROOT_COLLECTION.users)
      .doc(decoded.uid)
      .get();
    if (!snapshot.exists) {
      throw new AppException(ErrorCode.USER_NOT_FOUND, 'User profile was not found');
    }

    const profile = snapshot.data() as UserProfileDoc;
    if (!profile.tenantId) {
      throw new AppException(ErrorCode.TENANT_NOT_FOUND, 'User is not assigned to a tenant');
    }
    if (profile.status && profile.status !== 'active') {
      throw new AppException(ErrorCode.USER_INACTIVE, 'User account is inactive');
    }

    // A gym member account is always a plain user without staff permissions, even if its profile
    // was edited to carry another role or roleIds: members only reach their own /gym/mobile routes.
    const isMember = profile.accountType === 'gym_member';
    const role: UserRole = isMember ? 'user' : profile.role;
    const store: TenantStore = {
      tenantId: profile.tenantId,
      userId: decoded.uid,
      role,
      modules: profile.modules ?? [],
      email: profile.email ?? decoded.email ?? '',
      accountType: profile.accountType,
      roleIds: profile.roleIds ?? [],
      displayName: profile.displayName ?? null,
      phone: profile.phone ?? decoded.phone_number ?? null,
      permissions:
        role === 'owner'
          ? fullPermissionMap(profile.modules ?? [])
          : isMember
            ? {}
            : await this.loadPermissions(profile.tenantId, profile.roleIds ?? []),
    };

    this.tenantContext.enter(store);
    request.currentUser = store;
    return true;
  }

  private async loadPermissions(tenantId: string, roleIds: string[]): Promise<PermissionMap> {
    const unique = [...new Set(roleIds.filter(Boolean))];
    if (unique.length === 0) {
      return {};
    }
    const collection = this.firebase.db.collection(
      tenantCollectionPath(tenantId, TENANT_COLLECTION.roles),
    );
    const snapshots = await this.firebase.db.getAll(...unique.map((id) => collection.doc(id)));
    const maps = snapshots
      .filter((doc) => doc.exists)
      .map((doc) => doc.data() as RoleDoc)
      .filter((role) => !role.deletedAt)
      .map((role) => normalizePermissionMap(role.permissions));
    return mergePermissionMaps(maps);
  }
}
