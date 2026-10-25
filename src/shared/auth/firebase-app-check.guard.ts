import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { AppException } from '../errors/app.exception';
import { ErrorCode } from '../errors/error-codes';
import { FirebaseService } from '../firebase/firebase.service';

/** Verifies Firebase App Check when the product rollout flag is enabled. */
@Injectable()
export class FirebaseAppCheckGuard implements CanActivate {
  constructor(private readonly firebase: FirebaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (process.env['FGAS_REQUIRE_APP_CHECK'] !== 'true') return true;
    const request = context.switchToHttp().getRequest<Request>();
    const token = request.header('x-firebase-appcheck');
    if (!token)
      throw new AppException(ErrorCode.AUTH_REQUIRED, 'Firebase App Check token is required');
    try {
      await this.firebase.appCheck.verifyToken(token);
      return true;
    } catch {
      throw new AppException(ErrorCode.INVALID_TOKEN, 'Invalid Firebase App Check token');
    }
  }
}
