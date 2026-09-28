import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { TENANT_COLLECTION, tenantCollectionPath } from '../../../shared/firebase/firestore-path';
import { TenantContext, TenantStore } from '../../../shared/tenancy/tenant.context';
import { FarmStore, sanitizeFarmFields, toPlain } from './farm-store';

function fakeDb(docs: Record<string, Record<string, unknown>>) {
  const paths: string[] = [];
  const writes: { path: string; data: Record<string, unknown> }[] = [];
  const db = {
    collection: (path: string) => {
      paths.push(path);
      const docRef = (id: string) => ({
        id,
        get: async () => ({
          exists: Boolean(docs[`${path}/${id}`]),
          id,
          data: () => docs[`${path}/${id}`],
        }),
        set: async (data: Record<string, unknown>) => {
          writes.push({ path: `${path}/${id}`, data });
        },
      });
      return {
        doc: (id?: string) => docRef(id ?? 'generated-id'),
        where: (_field: string, op: string) => ({
          get: async () => ({
            docs: Object.entries(docs)
              .filter(([key]) => key.startsWith(`${path}/`))
              .filter(([, data]) => (op === '==' ? !data['deletedAt'] : Boolean(data['deletedAt'])))
              .map(([key, data]) => ({ id: key.slice(path.length + 1), data: () => data })),
          }),
        }),
      };
    },
  };
  return { db, paths, writes };
}

const owner: TenantStore = {
  tenantId: 'tenant-b',
  userId: 'owner-b',
  role: 'owner',
  modules: ['farm'],
  email: 'owner@example.com',
};

const staff: TenantStore = { ...owner, userId: 'staff-b', role: 'user' };

describe('FarmStore', () => {
  const animals = tenantCollectionPath('tenant-b', TENANT_COLLECTION.farmAnimals);
  const members = tenantCollectionPath('tenant-b', TENANT_COLLECTION.farmMembers);

  it('reads and writes only the current tenant collections', async () => {
    const { db, paths, writes } = fakeDb({
      [`${animals}/a1`]: { tagNo: 'TR1', herdId: 'h1', deletedAt: null },
      [`${animals}/a2`]: { tagNo: 'TR2', herdId: 'h2', deletedAt: null },
      [`${animals}/a3`]: { tagNo: 'TR3', herdId: 'h1', deletedAt: '2026-01-01T00:00:00.000Z' },
    });
    const context = new TenantContext();
    const store = new FarmStore({ db } as never, context);

    await context.run(owner, async () => {
      const active = await store.list(TENANT_COLLECTION.farmAnimals, { equals: { herdId: 'h1' } });
      expect(active.map((item) => item.id)).toEqual(['a1']);
      const deleted = await store.list(TENANT_COLLECTION.farmAnimals, { deleted: true });
      expect(deleted.map((item) => item.id)).toEqual(['a3']);

      const created = await store.create(TENANT_COLLECTION.farmAnimals, { tagNo: 'TR4' });
      expect(created).toMatchObject({
        tagNo: 'TR4',
        farmId: 'tenant-b',
        createdBy: 'owner-b',
        deletedAt: null,
      });
    });

    expect(paths.every((path) => path.startsWith('tenants/tenant-b/'))).toBe(true);
    expect(writes[0].path).toBe(`${animals}/generated-id`);
  });

  it('treats the owner as admin and other users by their member card', async () => {
    const { db } = fakeDb({
      [`${members}/staff-b`]: { role: 'okuyucu', status: 'active', deletedAt: null },
    });
    const context = new TenantContext();
    const store = new FarmStore({ db } as never, context);

    await context.run(owner, async () => {
      await expect(store.currentRole()).resolves.toBe('admin');
    });
    await context.run(staff, async () => {
      await expect(store.currentRole()).resolves.toBe('okuyucu');
      await expect(store.assertCanWrite()).rejects.toMatchObject({
        code: ErrorCode.FARM_FORBIDDEN,
      });
    });
  });

  it('denies users of the tenant without an active member card', async () => {
    const { db } = fakeDb({
      [`${members}/staff-b`]: { role: 'saha', deletedAt: '2026-01-01T00:00:00.000Z' },
    });
    const context = new TenantContext();
    const store = new FarmStore({ db } as never, context);

    await context.run(staff, async () => {
      await expect(store.requireRole()).rejects.toBeInstanceOf(AppException);
    });
  });
});

describe('sanitizeFarmFields', () => {
  it('drops server-owned fields and undefined values', () => {
    expect(
      sanitizeFarmFields({
        name: 'Koyun',
        id: 'x',
        farmId: 'other-tenant',
        createdAt: 'x',
        deletedAt: null,
        extra: undefined,
      }),
    ).toEqual({ name: 'Koyun' });
  });

  it('rejects non-objects and field-path keys', () => {
    expect(() => sanitizeFarmFields([1, 2])).toThrow(AppException);
    expect(() => sanitizeFarmFields('x')).toThrow(AppException);
    expect(() => sanitizeFarmFields({ 'a.b': 1 })).toThrow(AppException);
  });
});

describe('toPlain', () => {
  it('turns Firestore Timestamps into ISO strings, deeply', () => {
    const at = new Date('2026-05-01T10:00:00.000Z');
    const timestamp = { toDate: () => at };
    expect(toPlain({ createdAt: timestamp, shares: [{ paidAt: timestamp }], n: 1 })).toEqual({
      createdAt: at.toISOString(),
      shares: [{ paidAt: at.toISOString() }],
      n: 1,
    });
  });
});
