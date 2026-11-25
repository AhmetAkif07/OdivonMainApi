import { FakeFirestore } from '../../shared/testing/fake-firestore';
import { TenantContext, TenantStore } from '../../shared/tenancy/tenant.context';
import { DietMemberGuard, DietStaffGuard } from './diet-access.guards';
import { DietPortalService } from './diet-portal.service';
import { DietRepository } from './diet.repository';
import { DietService } from './diet.service';

const owner: TenantStore = {
  tenantId: 'clinic-a',
  userId: 'clinic-a-owner',
  role: 'owner',
  modules: ['diet'],
  email: 'owner@clinic-a.test',
  displayName: 'Dyt. Deniz Arslan',
};

const member = (uid: string, clientId: string, tenantId = 'clinic-a'): TenantStore => ({
  tenantId,
  userId: uid,
  role: 'user',
  modules: ['diet'],
  email: 'elif@ornek.com',
  accountType: 'diet_member',
  dietClientId: clientId,
  permissions: {},
});

function setup() {
  const db = new FakeFirestore();
  const tenant = new TenantContext();
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const profiles = new Map<string, Record<string, unknown>>();
  const identity = {
    listByCurrentTenant: jest.fn().mockResolvedValue([]),
    findByUid: jest.fn(async (uid: string) =>
      uid === 'clinic-a-owner' ? { uid, displayName: 'Dyt. Deniz Arslan', email: 'd@x' } : (profiles.get(uid) ?? null),
    ),
    createProfile: jest.fn(async (p: Record<string, unknown>) => {
      profiles.set(p['uid'] as string, p);
      return p;
    }),
    updateProfile: jest.fn(async (uid: string, patch: Record<string, unknown>) => {
      profiles.set(uid, { ...profiles.get(uid), ...patch });
    }),
    hardDelete: jest.fn(),
  };
  let n = 0;
  const auth = {
    createUser: jest.fn(async () => ({ uid: `member-${++n}` })),
    updateUser: jest.fn().mockResolvedValue(undefined),
    deleteUser: jest.fn().mockResolvedValue(undefined),
    setCustomUserClaims: jest.fn().mockResolvedValue(undefined),
    revokeRefreshTokens: jest.fn().mockResolvedValue(undefined),
    generatePasswordResetLink: jest.fn(async (email: string) => `https://reset.test/?email=${email}`),
  };
  const tenants = { getById: jest.fn().mockResolvedValue({ name: 'Arslan Beslenme' }) };
  const mail = { sendDietPortalInvite: jest.fn().mockResolvedValue(true) };
  const repo = new DietRepository({ db } as never, tenant, audit as never);
  const diet = new DietService(repo, tenant, identity as never);
  const portal = new DietPortalService(
    repo,
    diet,
    tenant,
    { auth, db } as never,
    identity as never,
    tenants as never,
    mail as never,
  );
  return { tenant, diet, portal, auth, mail, profiles };
}

const newClient = {
  firstName: 'Elif',
  lastName: 'Kaya',
  email: 'Elif@Ornek.com',
  sex: 'female' as const,
  heightCm: 165,
  startWeightKg: 82,
  targetWeightKg: 68,
  clinicalNotes: 'Metformin kullanıyor',
};

describe('DietPortalService', () => {
  it('invites a client: member account, claims, set-password mail', async () => {
    const { tenant, diet, portal, auth, mail, profiles } = setup();
    await tenant.run(owner, async () => {
      const { id } = await diet.createClient(newClient);
      const result = await portal.invite(id);
      expect(result).toMatchObject({ emailSent: true, portal: { status: 'invited', uid: 'member-1', email: 'elif@ornek.com' } });
      expect(auth.createUser).toHaveBeenCalledWith(expect.objectContaining({ email: 'elif@ornek.com', emailVerified: true }));
      expect(auth.setCustomUserClaims).toHaveBeenCalledWith('member-1', {
        tenantId: 'clinic-a',
        role: 'member',
        accountType: 'diet_member',
        clientId: id,
        modules: ['diet'],
      });
      expect(profiles.get('member-1')).toMatchObject({ accountType: 'diet_member', dietClientId: id, role: 'user', roleIds: [] });
      expect(mail.sendDietPortalInvite).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'elif@ornek.com', tenantName: 'Arslan Beslenme', dietitianName: 'Dyt. Deniz Arslan' }),
      );

      // Re-inviting reuses the same account instead of creating a second one.
      await portal.invite(id);
      expect(auth.createUser).toHaveBeenCalledTimes(1);
    });
  });

  it('requires an e-mail and maps a taken address to a conflict', async () => {
    const { tenant, diet, portal, auth } = setup();
    await tenant.run(owner, async () => {
      const noMail = await diet.createClient({ ...newClient, email: '' });
      await expect(portal.invite(noMail.id)).rejects.toMatchObject({ code: 'DIET_RECORD_INVALID' });
      const other = await diet.createClient({ ...newClient, email: 'taken@x.com' });
      auth.createUser.mockRejectedValueOnce({ errorInfo: { code: 'auth/email-already-exists' } });
      await expect(portal.invite(other.id)).rejects.toMatchObject({ code: 'DIET_PORTAL_CONFLICT' });
    });
  });

  it('scopes the member to their own record and hides private notes', async () => {
    const { tenant, diet, portal } = setup();
    let clientId = '';
    let otherId = '';
    await tenant.run(owner, async () => {
      clientId = (await diet.createClient(newClient)).id;
      otherId = (await diet.createClient({ ...newClient, firstName: 'Ayşe', email: 'ayse@x.com' })).id;
      await portal.invite(clientId);
      await diet.createConsultation({ clientId, at: '2030-01-10T10:00:00Z', channel: 'video', notes: 'Gizli not' });
      const base = { clientId, startDate: '2026-11-01', endDate: '2026-11-30', kcal: 1650, proteinPct: 25, carbPct: 45, fatPct: 30 };
      await diet.createPlan({ ...base, title: 'Aktif', status: 'active' });
      await diet.createPlan({ ...base, title: 'Taslak', status: 'draft' });
      await diet.createTask(otherId, { title: 'Başkasının görevi', category: 'other' });
    });

    await tenant.run(member('member-1', clientId), async () => {
      const me = await portal.me();
      expect(me.client).toMatchObject({ id: clientId, firstName: 'Elif' });
      expect(me.client).not.toHaveProperty('clinicalNotes');
      expect(me.client).not.toHaveProperty('portal');
      expect(me).toMatchObject({ clinic: { name: 'Arslan Beslenme' }, dietitian: { name: 'Dyt. Deniz Arslan' } });
      expect(me.nextConsultation).not.toHaveProperty('notes');
      expect((await portal.plans()).map((p) => p.title)).toEqual(['Aktif']);
      expect(await portal.tasks()).toHaveLength(0);
      const [consultation] = await portal.consultations();
      expect(consultation).not.toHaveProperty('notes');
    });

    // The profile's client id decides; a token for another account cannot read this client.
    await tenant.run(member('intruder', clientId), async () => {
      await expect(portal.me()).rejects.toMatchObject({ code: 'DIET_PORTAL_FORBIDDEN' });
    });
    await tenant.run(member('member-1', clientId, 'clinic-b'), async () => {
      await expect(portal.me()).rejects.toMatchObject({ code: 'DIET_PORTAL_FORBIDDEN' });
    });
    await tenant.run(owner, async () => {
      expect((await diet.getClient(clientId)).portal).toMatchObject({ status: 'active' });
    });
  });

  it('exchanges messages, completes tasks and files requests', async () => {
    const { tenant, diet, portal } = setup();
    let clientId = '';
    let taskId = '';
    await tenant.run(owner, async () => {
      clientId = (await diet.createClient(newClient)).id;
      await portal.invite(clientId);
      await diet.sendMessage(clientId, { body: 'Merhaba Elif Hanım' });
      taskId = (await diet.createTask(clientId, { title: 'Su takibi', category: 'water' })).id;
    });
    await tenant.run(member('member-1', clientId), async () => {
      expect((await portal.me()).unreadMessages).toBe(2);
      expect(await portal.markRead()).toMatchObject({ unreadForMember: 0 });
      await portal.sendMessage({ body: 'Teşekkürler!' });
      await expect(portal.completeTask(taskId, { note: '2,5 L içtim' })).resolves.toMatchObject({ status: 'done' });
      await portal.createRequest({ type: 'appointment', subject: 'Randevu değişikliği' });
      await portal.addMeasurement({ weightKg: 79.4 });
      expect(await portal.giveConsent()).toMatchObject({ consentAt: expect.any(String) });
      expect((await portal.messages({})).map((m) => m.author)).toEqual(['dietitian', 'system', 'member', 'member', 'member']);
    });
    await tenant.run(owner, async () => {
      const [conversation] = await diet.listConversations();
      expect(conversation).toMatchObject({ unreadForStaff: 3, unreadForMember: 0, lastAuthor: 'member' });
      expect(await diet.listRequests({ clientId })).toEqual([expect.objectContaining({ subject: 'Randevu değişikliği' })]);
      expect(await diet.getClient(clientId)).toMatchObject({ currentWeightKg: 79.4 });
      expect((await diet.listMeasurements(clientId))[0]).toMatchObject({ source: 'member' });
    });
  });

  it('disables the portal and blocks the member afterwards', async () => {
    const { tenant, diet, portal, auth, profiles } = setup();
    let clientId = '';
    await tenant.run(owner, async () => {
      clientId = (await diet.createClient(newClient)).id;
      await portal.invite(clientId);
      expect(await portal.disable(clientId)).toMatchObject({ portal: { status: 'disabled' } });
    });
    expect(auth.updateUser).toHaveBeenCalledWith('member-1', { disabled: true });
    expect(auth.revokeRefreshTokens).toHaveBeenCalledWith('member-1');
    expect(profiles.get('member-1')).toMatchObject({ status: 'inactive' });
    await tenant.run(member('member-1', clientId), async () => {
      await expect(portal.me()).rejects.toMatchObject({ code: 'DIET_PORTAL_FORBIDDEN' });
    });
  });
});

describe('diet access guards', () => {
  const ctx = (store: TenantStore) => ({ switchToHttp: () => ({ getRequest: () => ({ currentUser: store }) }) }) as never;
  const tenant = new TenantContext();

  it('keeps members off staff routes and staff off the portal', () => {
    expect(() => new DietStaffGuard(tenant).canActivate(ctx(member('m', 'c')))).toThrow(
      expect.objectContaining({ code: 'FORBIDDEN_ROLE' }),
    );
    expect(new DietStaffGuard(tenant).canActivate(ctx(owner))).toBe(true);
    expect(() => new DietMemberGuard(tenant).canActivate(ctx(owner))).toThrow(
      expect.objectContaining({ code: 'DIET_PORTAL_FORBIDDEN' }),
    );
    expect(new DietMemberGuard(tenant).canActivate(ctx(member('m', 'c')))).toBe(true);
  });
});
