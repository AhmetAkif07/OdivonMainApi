import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { DecodedIdToken } from 'firebase-admin/auth';
import { AppException } from '../errors/app.exception';
import { ErrorCode } from '../errors/error-codes';
import { FirebaseService } from '../firebase/firebase.service';

export const AUTHENTICATED_USER_KEY = 'firebaseUser';

@Injectable()
export class FirebaseAuthGuard implements CanActivate {
  constructor(private readonly firebase: FirebaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const header = request.header('authorization');
    if (!header?.startsWith('Bearer ')) {
      throw new AppException(ErrorCode.AUTH_REQUIRED, 'Authorization bearer token is required');
    }

    const token = header.slice('Bearer '.length).trim();
    if (!token) {
      throw new AppException(ErrorCode.AUTH_REQUIRED, 'Authorization bearer token is required');
    }

    try {
      const decoded = await this.firebase.auth.verifyIdToken(token);
      (request as Request & { [AUTHENTICATED_USER_KEY]: DecodedIdToken })[AUTHENTICATED_USER_KEY] =
        decoded;
      return true;
    } catch {
      throw new AppException(ErrorCode.INVALID_TOKEN, 'Invalid or expired Firebase ID token');
    }
  }
}

export function getDecodedToken(request: Request): DecodedIdToken {
  const decoded = (request as Request & { [AUTHENTICATED_USER_KEY]?: DecodedIdToken })[
    AUTHENTICATED_USER_KEY
  ];
  if (!decoded) {
    throw new AppException(ErrorCode.AUTH_REQUIRED, 'Authenticated user is missing');
  }
  return decoded;
}
