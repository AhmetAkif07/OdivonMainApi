import { AsyncLocalStorage } from 'async_hooks';
import { Injectable } from '@nestjs/common';
import { ProductModule, UserRole } from '../authorization/constants';
import { AppException } from '../errors/app.exception';
import { ErrorCode } from '../errors/error-codes';

export interface TenantStore {
  tenantId: string;
  userId: string;
  role: UserRole;
  modules: ProductModule[];
  email: string;
}

@Injectable()
export class TenantContext {
  private readonly storage = new AsyncLocalStorage<TenantStore>();

  enter(store: TenantStore): void {
    this.storage.enterWith(store);
  }

  run<T>(store: TenantStore, fn: () => T): T {
    return this.storage.run(store, fn);
  }

  getStore(): TenantStore {
    const store = this.storage.getStore();
    if (!store) {
      throw new AppException(
        ErrorCode.TENANT_CONTEXT_MISSING,
        'Tenant context is missing for this request',
      );
    }
    return store;
  }

  tryGetStore(): TenantStore | undefined {
    return this.storage.getStore();
  }

  getTenantId(): string {
    return this.getStore().tenantId;
  }

  getUserId(): string {
    return this.getStore().userId;
  }
}
