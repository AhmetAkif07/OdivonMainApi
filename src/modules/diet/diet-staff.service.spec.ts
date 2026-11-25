import { FakeFirestore } from '../../shared/testing/fake-firestore';
import { TenantContext, TenantStore } from '../../shared/tenancy/tenant.context';
import { DietStaffService } from './diet-staff.service';

const owner: TenantStore = {
  tenantId: 'clinic-a',
  userId: 'owner-1',
  role: 'owner',
  modules: ['diet'],
  email: 'owner@clinic-a.test',
};

function setup() {
  const db = new FakeFirestore();
  const tenant = new TenantContext();
  const profiles = new Map<string, Record<string, unknown>>([
    ['owner-1', { uid: 'owner-1', tenantId: 'clinic-a', role: 'owner', email: 'owner@clinic-a.test', displayName: 'Dyt. Deniz', status: 'active', createdAt: 'x' }],
    ['member-1', { uid: 'member-1', tenantId: 'clinic-a', role: 'user', accountType: 'diet_member', email: 'elif@x.com', status: 'active', createdAt: 'x' }],
  ]);
  const users = {
    listByCurrentTenant: jest.fn(async () => [...profiles.values()]),
    findByUid: jest.fn(async (uid: string) => profiles.get(uid) ?? null),
    createProfile: jest.fn(async (p: Record<string, unknown>) => profiles.set(p['uid'] as string, p)),
    updateProfile: jest.fn(async (uid: string, patch: Record<string, unknown>) => profiles.set(uid, { ...profiles.get(uid), ...patch })),
    hardDelete: jest.fn(),
  };
  const auth = {
    createUser: jest.fn(async () => ({ uid: 'staff-1' })),
    updateUser: jest.fn().mockResolvedValue(undefined),
    deleteUser: jest.fn().mockResolvedValue(undefined),
    setCustomUserClaims: jest.fn().mockResolvedValue(undefined),
    revokeRefreshTokens: jest.fn().mockResolvedValue(undefined),
    generatePasswordResetLink: jest.fn(async (email: string) => `https://reset.test/?email=${email}`),
  };
  const mail = { sendStaffInvite: jest.fn().mockResolvedValue(true) };
  const service = new DietStaffService(
    { db, auth } as never,
    tenant,
    users as never,
    { getById: jest.fn().mockResolvedValue({ name: 'Arslan Beslenme' }) } as never,
    mail as never,
  );
  return { db, tenant, service, auth, mail, profiles };
}

describe('DietStaffService', () => {
  it('invites staff with a role template and a set-password link', async () => {
    const { db, tenant, service, auth, mail, profiles } = setup();
    await tenant.run(owner, async () => {
      const result = await service.invite({ email: 'Ayse@Klinik.com', displayName: 'Ayşe Yılmaz', role: 'diet-reception' });
      expect(result).toMatchObject({ emailSent: true, staff: { uid: 'staff-1', roleKey: 'diet-reception', roleLabel: 'Ön Büro / Klinik Sekreteri' } });
      expect(auth.createUser).toHaveBeenCalledWith(expect.objectContaining({ email: 'ayse@klinik.com', emailVerified: true }));
      expect(profiles.get('staff-1')).toMatchObject({ accountType: 'staff', roleIds: ['diet-reception'], role: 'user' });
      expect(mail.sendStaffInvite).toHaveBeenCalledWith(expect.objectContaining({ module: 'diet', tenantName: 'Arslan Beslenme' }));
      const role = (await db.collection('tenants/clinic-a/roles').doc('diet-reception').get()).data();
      expect(role).toMatchObject({ name: 'Ön Büro / Klinik Sekreteri', permissions: { dietClients: ['view', 'create', 'update'] } });

      const team = await service.list();
      expect(team.map((m) => m.uid)).toEqual(['owner-1', 'staff-1']);
      expect(team[0]).toMatchObject({ isOwner: true, isMe: true, roleLabel: 'Klinik Yöneticisi' });
    });
  });

  it('changes roles, deactivates staff and protects the owner', async () => {
    const { tenant, service, auth, profiles } = setup();
    await tenant.run(owner, async () => {
      await service.invite({ email: 'a@b.com', displayName: 'Ayşe', role: 'diet-assistant' });
      await expect(service.update('staff-1', { role: 'diet-dietitian' })).resolves.toMatchObject({ roleKey: 'diet-dietitian' });
      await expect(service.update('staff-1', { status: 'inactive' })).resolves.toMatchObject({ status: 'inactive' });
      expect(auth.updateUser).toHaveBeenCalledWith('staff-1', { disabled: true });
      expect(profiles.get('staff-1')).toMatchObject({ roleIds: ['diet-dietitian'], status: 'inactive' });
      await expect(service.update('owner-1', { status: 'inactive' })).rejects.toMatchObject({ code: 'FORBIDDEN_ROLE' });
      await expect(service.update('member-1', { role: 'diet-dietitian' })).rejects.toMatchObject({ code: 'USER_NOT_FOUND' });
    });
  });

  it('reports an e-mail that already has an account', async () => {
    const { tenant, service, auth } = setup();
    auth.createUser.mockRejectedValueOnce({ errorInfo: { code: 'auth/email-already-exists' } });
    await tenant.run(owner, async () => {
      await expect(service.invite({ email: 'x@y.com', displayName: 'X Y', role: 'diet-dietitian' })).rejects.toMatchObject({
        code: 'DIET_PORTAL_CONFLICT',
      });
    });
  });
});
