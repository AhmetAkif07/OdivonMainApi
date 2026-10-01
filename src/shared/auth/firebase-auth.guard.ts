import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { DecodedIdToken } from 'firebase-admin/auth';
import { AppException } from '../errors/app.exception';
import { ErrorCode } from '../errors/error-codes';
import { loadConfiguration } from '../../config/configuration';
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

    let decoded: DecodedIdToken;
    try {
      decoded = await this.firebase.auth.verifyIdToken(token);
    } catch {
      throw new AppException(ErrorCode.INVALID_TOKEN, 'Invalid or expired Firebase ID token');
    }
    // Firebase refreshes ID tokens forever while "remember me" is on; cap the sign-in itself.
    if (isSessionExpired(decoded.auth_time, sessionMaxAgeMs())) {
      throw new AppException(ErrorCode.SESSION_EXPIRED, 'Session has expired, please sign in again');
    }
    (request as Request & { [AUTHENTICATED_USER_KEY]: DecodedIdToken })[AUTHENTICATED_USER_KEY] = decoded;
    return true;
  }
}

const DAY_MS = 86_400_000;
let cachedMaxAgeMs: number | null = null;

function sessionMaxAgeMs(): number {
  if (cachedMaxAgeMs == null) {
    cachedMaxAgeMs = loadConfiguration().sessionMaxAgeDays * DAY_MS;
  }
  return cachedMaxAgeMs;
}

/** `authTime` is the token's `auth_time` claim (seconds): when the user actually signed in. */
export function isSessionExpired(authTime: number | undefined, maxAgeMs: number, now = Date.now()): boolean {
  if (!authTime) return false;
  return now - authTime * 1000 > maxAgeMs;
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
