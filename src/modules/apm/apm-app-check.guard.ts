import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { AppException } from '../../shared/errors/app.exception';
import { ErrorCode } from '../../shared/errors/error-codes';
import { FirebaseService } from '../../shared/firebase/firebase.service';

@Injectable()
export class ApmAppCheckGuard implements CanActivate {
  constructor(private readonly firebase: FirebaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = process.env.APM_REQUIRE_APP_CHECK === 'true' || process.env.NODE_ENV === 'production';
    if (!required) return true;
    const request = context.switchToHttp().getRequest<Request>();
    const token = request.header('x-firebase-appcheck');
    if (!token) throw new AppException(ErrorCode.AUTH_REQUIRED, 'Firebase App Check token is required');
    try {
      await this.firebase.appCheck.verifyToken(token);
      return true;
    } catch {
      throw new AppException(ErrorCode.INVALID_TOKEN, 'Invalid Firebase App Check token');
    }
  }
}
