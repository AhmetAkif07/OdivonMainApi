import { AsyncLocalStorage } from 'async_hooks';
import { ExecutionContext, Injectable } from '@nestjs/common';
import { ProductModule, UserRole } from '../authorization/constants';
import { PermissionMap } from '../authorization/permissions';
import { AppException } from '../errors/app.exception';
import { ErrorCode } from '../errors/error-codes';

export interface TenantStore {
  tenantId: string;
  userId: string;
  role: UserRole;
  modules: ProductModule[];
  email: string;
  permissions?: PermissionMap;
}

export interface RequestWithTenant {
  currentUser?: TenantStore;
}

interface TenantAlsBag {
  current?: TenantStore;
}

const tenantAls = new AsyncLocalStorage<TenantAlsBag>();

@Injectable()
export class TenantContext {
  enter(store: TenantStore): void {
    const bag = tenantAls.getStore();
    if (bag) {
      bag.current = store;
      return;
    }
    tenantAls.enterWith({ current: store });
  }

  run<T>(store: TenantStore, fn: () => T): T {
    return tenantAls.run({ current: store }, fn);
  }

  runBag(fn: () => void): void {
    if (tenantAls.getStore()) {
      fn();
      return;
    }
    tenantAls.run({}, fn);
  }

  getStore(): TenantStore {
    const store = this.tryGetStore();
    if (!store) {
      throw new AppException(
        ErrorCode.TENANT_CONTEXT_MISSING,
        'Tenant context is missing for this request',
      );
    }
    return store;
  }

  tryGetStore(): TenantStore | undefined {
    return tenantAls.getStore()?.current;
  }

  getTenantId(): string {
    return this.getStore().tenantId;
  }

  getUserId(): string {
    return this.getStore().userId;
  }
}

export function resolveRequestTenant(
  context: ExecutionContext,
  tenantContext: TenantContext,
): TenantStore {
  if (typeof context.switchToHttp === 'function') {
    const request = context.switchToHttp().getRequest<RequestWithTenant>();
    if (request?.currentUser) {
      return request.currentUser;
    }
  }
  return tenantContext.getStore();
}
