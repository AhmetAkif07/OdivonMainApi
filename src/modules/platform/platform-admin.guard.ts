import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { AppException } from '../../shared/errors/app.exception';
import { ErrorCode } from '../../shared/errors/error-codes';
import { FirebaseService } from '../../shared/firebase/firebase.service';
import { ROOT_COLLECTION } from '../../shared/firebase/firestore-path';
import { getDecodedToken } from '../../shared/auth/firebase-auth.guard';

export interface PlatformAdminUser {
  uid: string;
  email: string;
  status: 'active' | 'inactive';
  grantedAt?: string;
  revokedAt?: string;
  updatedAt?: string;
}

export const PLATFORM_ADMIN_KEY = 'platformAdmin';

@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(private readonly firebase: FirebaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const decoded = getDecodedToken(request);

    // Source of truth is Firestore users/platformAdmins/{uid}
    const doc = await this.firebase.db.collection(ROOT_COLLECTION.platformAdmins).doc(decoded.uid).get();
    if (!doc.exists) {
      throw new AppException(ErrorCode.PLATFORM_ADMIN_REQUIRED, 'Platform admin access required');
    }

    const adminData = doc.data() as PlatformAdminUser;
    if (adminData.status !== 'active') {
      throw new AppException(ErrorCode.PLATFORM_FORBIDDEN, 'Platform admin account is inactive');
    }

    (request as Request & { [PLATFORM_ADMIN_KEY]: PlatformAdminUser })[PLATFORM_ADMIN_KEY] = adminData;
    return true;
  }
}

export function getPlatformAdmin(request: Request): PlatformAdminUser {
  const admin = (request as Request & { [PLATFORM_ADMIN_KEY]?: PlatformAdminUser })[PLATFORM_ADMIN_KEY];
  if (!admin) {
    throw new AppException(ErrorCode.PLATFORM_ADMIN_REQUIRED, 'Platform admin is missing from request');
  }
  return admin;
}
