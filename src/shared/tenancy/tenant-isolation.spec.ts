import { TenantContext } from './tenant.context';
import { ErrorCode } from '../errors/error-codes';
import { AppException } from '../errors/app.exception';
import { CustomersRepository } from '../../modules/vet/customers/customers.repository';
import { TENANT_COLLECTION, tenantCollectionPath } from '../firebase/firestore-path';

const store = {
  tenantId: 'tenant-b',
  userId: 'user-b',
  role: 'owner' as const,
  modules: ['vet' as const],
  email: 'b@example.com',
};

describe('tenant isolation', () => {
  it('repository reads only the current tenant collection', async () => {
    const paths: string[] = [];
    const firebase = {
      db: {
        collection: (path: string) => {
          paths.push(path);
          return {
            doc: (id: string) => ({
              get: async () => ({ exists: false, id }),
            }),
          };
        },
      },
    };
    const context = new TenantContext();
    const repo = new CustomersRepository(firebase as never, context, { record: jest.fn() } as never);

    await context.run(store, async () => {
      await expect(repo.getByIdOrThrow('customer-from-a')).rejects.toMatchObject({
        code: ErrorCode.CUSTOMER_NOT_FOUND,
      });
    });

    expect(paths).toContain(tenantCollectionPath('tenant-b', TENANT_COLLECTION.customers));
    expect(paths.some((path) => path === 'customers')).toBe(false);
    expect(paths.some((path) => path.includes('tenant-a'))).toBe(false);
  });

  it('missing tenant context throws TENANT_CONTEXT_MISSING', () => {
    const context = new TenantContext();
    expect(() => context.getTenantId()).toThrow(AppException);
    try {
      context.getTenantId();
    } catch (error) {
      expect((error as AppException).code).toBe(ErrorCode.TENANT_CONTEXT_MISSING);
    }
  });

  it('keeps tenant after an async gap', async () => {
    const context = new TenantContext();
    await context.run(store, async () => {
      await Promise.resolve();
      expect(context.getTenantId()).toBe('tenant-b');
    });
  });

  it('shares tenant across TenantContext instances in the same async context', () => {
    const writer = new TenantContext();
    const reader = new TenantContext();
    writer.run(store, () => {
      expect(reader.getTenantId()).toBe('tenant-b');
    });
  });
});
