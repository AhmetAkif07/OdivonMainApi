import { firstValueFrom, from, map } from 'rxjs';
import { TenantContextInterceptor } from './tenant-context.interceptor';
import { TenantContext } from './tenant.context';

describe('TenantContextInterceptor', () => {
  const store = {
    tenantId: 'tenant-1',
    userId: 'user-1',
    role: 'owner' as const,
    modules: ['vet' as const],
    email: 'owner@example.com',
  };

  it('keeps tenant context across an async handler observable', async () => {
    const tenantContext = new TenantContext();
    const interceptor = new TenantContextInterceptor(tenantContext);
    const executionContext = {
      switchToHttp: () => ({
        getRequest: () => ({ currentUser: store }),
      }),
    };
    const next = {
      handle: () => from(Promise.resolve()).pipe(map(() => tenantContext.getTenantId())),
    };

    await expect(firstValueFrom(interceptor.intercept(executionContext as never, next))).resolves.toBe(
      'tenant-1',
    );
  });

  it('makes tenant visible to a different TenantContext instance', async () => {
    const interceptorContext = new TenantContext();
    const repositoryContext = new TenantContext();
    const interceptor = new TenantContextInterceptor(interceptorContext);
    const executionContext = {
      switchToHttp: () => ({
        getRequest: () => ({ currentUser: store }),
      }),
    };
    const next = {
      handle: () => from(Promise.resolve()).pipe(map(() => repositoryContext.getTenantId())),
    };

    await expect(firstValueFrom(interceptor.intercept(executionContext as never, next))).resolves.toBe(
      'tenant-1',
    );
  });
});
