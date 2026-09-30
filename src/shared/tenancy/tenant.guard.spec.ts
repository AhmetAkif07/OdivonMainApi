import { ExecutionContext } from '@nestjs/common';
import { AUTHENTICATED_USER_KEY } from '../auth/firebase-auth.guard';
import { TenantContext, TenantStore } from './tenant.context';
import { TenantGuard } from './tenant.guard';

function setup(profile: Record<string, unknown>, rolePermissions: Record<string, unknown> = {}) {
  const getAll = jest.fn(async () => [{ exists: true, data: () => ({ permissions: rolePermissions }) }]);
  const firebase = {
    db: {
      collection: () => ({ doc: () => ({ get: async () => ({ exists: true, data: () => profile }) }) }),
      getAll,
    },
  };
  const request: Record<string, unknown> = { [AUTHENTICATED_USER_KEY]: { uid: 'u1', email: 'a@b.com' } };
  const context = { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
  const guard = new TenantGuard(firebase as never, new TenantContext());
  return { guard, context, request, getAll };
}

describe('TenantGuard', () => {
  it('loads role permissions for staff accounts', async () => {
    const { guard, context, request } = setup(
      { tenantId: 't1', role: 'user', modules: ['gym'], email: 'a@b.com', status: 'active', roleIds: ['gym-reception'] },
      { wallet: ['create'] },
    );
    await guard.canActivate(context);
    expect((request.currentUser as TenantStore).permissions).toEqual({ wallet: ['view', 'create'] });
  });

  it('never grants staff permissions or roles to a gym member account', async () => {
    const { guard, context, request, getAll } = setup(
      {
        tenantId: 't1',
        role: 'admin',
        accountType: 'gym_member',
        modules: ['gym'],
        email: 'a@b.com',
        status: 'active',
        roleIds: ['gym-manager'],
      },
      { wallet: ['create'] },
    );
    await guard.canActivate(context);
    const store = request.currentUser as TenantStore;
    expect(store.role).toBe('user');
    expect(store.accountType).toBe('gym_member');
    expect(store.permissions).toEqual({});
    expect(getAll).not.toHaveBeenCalled();
  });
});
