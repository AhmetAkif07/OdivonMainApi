import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { TenantContext, TenantStore } from '../../../shared/tenancy/tenant.context';
import { FakeFirestore } from '../../../shared/testing/fake-firestore';
import { HAIR_STAFF_ROLES } from '../shared/hair-roles';
import { HairStore } from '../shared/hair-store';
import { HairCoreService, PUBLIC_SLUGS_COLLECTION } from './hair-core.service';

const OWNER: TenantStore = {
  tenantId: 't1',
  userId: 'owner-1',
  role: 'owner',
  modules: ['hair'],
  email: 'owner@salon.test',
};

describe('HairCoreService', () => {
  let db: FakeFirestore;
  let context: TenantContext;
  let service: HairCoreService;
  const tenants = {
    getById: jest.fn(async () => ({ id: 't1', name: 'OdivonPro Hair Kadıköy' })),
    update: jest.fn(async () => undefined),
  };
  const users = { findByUid: jest.fn(async () => ({ email: 'owner@salon.test', displayName: 'Ayşe Yılmaz' })) };

  const as = <T>(store: TenantStore, fn: () => Promise<T>) => context.run(store, fn);
  const asOwner = <T>(fn: () => Promise<T>) => as(OWNER, fn);

  beforeEach(() => {
    db = new FakeFirestore();
    context = new TenantContext();
    const store = new HairStore({ db } as never, context);
    service = new HairCoreService(store, context, tenants as never, users as never);
    jest.clearAllMocks();
  });

  const paths = (prefix: string) => [...db.docs.keys()].filter((key) => key.startsWith(prefix));

  it('seeds roles, settings, the owner card and a first branch — once', async () => {
    await asOwner(() => service.ensureDefaults());
    await asOwner(() => service.ensureDefaults());

    expect(paths('tenants/t1/roles/')).toHaveLength(HAIR_STAFF_ROLES.length);
    expect(db.docs.get('tenants/t1/hairSettings/t1')).toMatchObject({ timezone: 'Europe/Istanbul', currency: 'TRY' });
    expect(db.docs.get('tenants/t1/hairStaff/owner-1')).toMatchObject({
      userId: 'owner-1',
      role: 'admin',
      firstName: 'Ayşe',
      lastName: 'Yılmaz',
    });
    expect(paths('tenants/t1/hairBranches/')).toEqual(['tenants/t1/hairBranches/main']);
    expect(db.docs.get(`${PUBLIC_SLUGS_COLLECTION}/odivonpro-hair-kadikoy`)).toEqual({
      slug: 'odivonpro-hair-kadikoy',
      tenantId: 't1',
      branchId: 'main',
    });
  });

  it('never exposes provider secrets in the settings view', async () => {
    await asOwner(() => service.ensureDefaults());
    const view = await asOwner(() => service.getSettings());
    expect(view.settings).toMatchObject({ smsConfigured: false, emailConfigured: false });
    expect(JSON.stringify(view)).not.toMatch(/apiKey|apiSecret/i);
  });

  it('validates settings: working hours order and time zone', async () => {
    await asOwner(() => service.ensureDefaults());
    await expect(asOwner(() => service.updateSettings({ workDayStart: '22:00', workDayEnd: '09:00' }))).rejects.toMatchObject({
      code: ErrorCode.HAIR_INVALID,
    });
    await expect(asOwner(() => service.updateSettings({ timezone: 'Mars/Phobos' }))).rejects.toBeInstanceOf(AppException);

    const updated = await asOwner(() => service.updateSettings({ reminderHoursBefore: 12, name: 'Yeni Ad' }));
    expect(updated.settings.reminderHoursBefore).toBe(12);
    expect(tenants.update).toHaveBeenCalledWith('t1', { name: 'Yeni Ad' });
  });

  it('generates unique slugs for branches with the same name', async () => {
    await asOwner(() => service.ensureDefaults());
    const first = await asOwner(() => service.createBranch({ name: 'Moda' }));
    const second = await asOwner(() => service.createBranch({ name: 'Moda' }));
    expect([first['slug'], second['slug']]).toEqual(['moda', 'moda-2']);
    expect(db.docs.get(`${PUBLIC_SLUGS_COLLECTION}/moda-2`)).toMatchObject({ branchId: second.id, tenantId: 't1' });
  });

  it('rejects an explicit slug that another branch owns', async () => {
    await asOwner(() => service.ensureDefaults());
    await asOwner(() => service.createBranch({ name: 'Moda', slug: 'moda' }));
    await expect(asOwner(() => service.createBranch({ name: 'Başka', slug: 'moda' }))).rejects.toMatchObject({
      code: ErrorCode.HAIR_PRECONDITION,
    });
  });

  it('moves the slug mapping when a branch slug changes', async () => {
    await asOwner(() => service.ensureDefaults());
    const branch = await asOwner(() => service.createBranch({ name: 'Moda', slug: 'moda' }));
    await asOwner(() => service.updateBranch(branch.id, { slug: 'moda-sube' }));
    expect(db.docs.has(`${PUBLIC_SLUGS_COLLECTION}/moda`)).toBe(false);
    expect(db.docs.get(`${PUBLIC_SLUGS_COLLECTION}/moda-sube`)).toMatchObject({ branchId: branch.id });
  });

  it('keeps at least one active branch and frees the slug on delete', async () => {
    await asOwner(() => service.ensureDefaults());
    await expect(asOwner(() => service.deleteBranch('main'))).rejects.toMatchObject({
      code: ErrorCode.LAST_ACTIVE_BRANCH,
    });
    await expect(asOwner(() => service.updateBranch('main', { active: false }))).rejects.toBeInstanceOf(AppException);

    const extra = await asOwner(() => service.createBranch({ name: 'Moda', slug: 'moda' }));
    await asOwner(() => service.deleteBranch(extra.id));
    expect(db.docs.has(`${PUBLIC_SLUGS_COLLECTION}/moda`)).toBe(false);
    const names = (await asOwner(() => service.listBranches())).map((branch) => branch['name']);
    expect(names).toEqual(['OdivonPro Hair Kadıköy']);
  });

  it('shows non-admin staff only the branches they work in', async () => {
    await asOwner(() => service.ensureDefaults());
    const moda = await asOwner(() => service.createBranch({ name: 'Moda' }));
    db.docs.set('tenants/t1/hairStaff/stylist-1', {
      id: 'stylist-1',
      userId: 'stylist-1',
      role: 'stylist',
      branchIds: [moda.id],
      active: true,
      deletedAt: null,
    });
    const stylist: TenantStore = { ...OWNER, userId: 'stylist-1', role: 'user' };

    const visible = await as(stylist, () => service.listBranches());
    expect(visible.map((branch) => branch.id)).toEqual([moda.id]);
    await expect(as(stylist, () => service.getBranch('main'))).rejects.toMatchObject({
      code: ErrorCode.HAIR_FORBIDDEN,
    });
  });

  it('refuses a caller without an active staff card', async () => {
    await asOwner(() => service.ensureDefaults());
    const stranger: TenantStore = { ...OWNER, userId: 'nobody', role: 'user' };
    await expect(as(stranger, () => service.getBranch('main'))).rejects.toMatchObject({
      code: ErrorCode.HAIR_FORBIDDEN,
    });
  });
});
