import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { DecodedIdToken } from 'firebase-admin/auth';
import { FirebaseService } from '../firebase/firebase.service';
import { AUTHENTICATED_USER_KEY } from './firebase-auth.guard';

/**
 * For public endpoints that also serve signed-in users: when a valid Bearer token is sent,
 * the decoded token is put on the request (same key as FirebaseAuthGuard). A missing or
 * invalid token never blocks the request; it just stays anonymous.
 */
@Injectable()
export class OptionalFirebaseAuthGuard implements CanActivate {
  constructor(private readonly firebase: FirebaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const header = request.header('authorization');
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
    if (!token) return true;

    try {
      const decoded = await this.firebase.auth.verifyIdToken(token);
      (request as Request & { [AUTHENTICATED_USER_KEY]: DecodedIdToken })[AUTHENTICATED_USER_KEY] = decoded;
    } catch {
      // Treat as anonymous.
    }
    return true;
  }
}

export function getOptionalDecodedToken(request: Request): DecodedIdToken | undefined {
  return (request as Request & { [AUTHENTICATED_USER_KEY]?: DecodedIdToken })[AUTHENTICATED_USER_KEY];
}
