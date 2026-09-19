import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { ProductModule, UserRole } from '../authorization/constants';
import { AppException } from '../errors/app.exception';
import { ErrorCode } from '../errors/error-codes';
import { FirebaseService } from '../firebase/firebase.service';
import { ROOT_COLLECTION } from '../firebase/firestore-path';
import { TenantContext, TenantStore } from './tenant.context';
import { getDecodedToken } from '../auth/firebase-auth.guard';

interface UserProfileDoc {
  tenantId: string;
  role: UserRole;
  modules: ProductModule[];
  email: string;
  status: string;
}

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly tenantContext: TenantContext,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const decoded = getDecodedToken(request);
    const snapshot = await this.firebase.db.collection(ROOT_COLLECTION.users).doc(decoded.uid).get();
    if (!snapshot.exists) {
      throw new AppException(ErrorCode.USER_NOT_FOUND, 'User profile was not found');
    }

    const profile = snapshot.data() as UserProfileDoc;
    if (!profile.tenantId) {
      throw new AppException(ErrorCode.TENANT_NOT_FOUND, 'User is not assigned to a tenant');
    }

    const store: TenantStore = {
      tenantId: profile.tenantId,
      userId: decoded.uid,
      role: profile.role,
      modules: profile.modules ?? [],
      email: profile.email ?? decoded.email ?? '',
    };

    this.tenantContext.enter(store);
    (request as Request & { currentUser: TenantStore }).currentUser = store;
    return true;
  }
}
