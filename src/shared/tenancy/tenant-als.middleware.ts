import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { TenantContext } from './tenant.context';

@Injectable()
export class TenantAlsMiddleware implements NestMiddleware {
  constructor(private readonly tenantContext: TenantContext) {}

  use(_req: Request, _res: Response, next: NextFunction): void {
    this.tenantContext.runBag(() => next());
  }
}
