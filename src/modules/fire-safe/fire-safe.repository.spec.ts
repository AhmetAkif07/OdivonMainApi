import { FakeFirestore } from '../../shared/testing/fake-firestore';
import { TenantContext, TenantStore } from '../../shared/tenancy/tenant.context';
import { FireSafeRepository } from './fire-safe.repository';
import { FIRE_SAFE_COLLECTIONS } from './fire-safe.constants';

const principal = (tenantId: string): TenantStore => ({ tenantId, userId: `${tenantId}-user`, role: 'owner', modules: ['fire-safe'], email: `${tenantId}@example.test` });

describe('FireSafeRepository', () => {
  it('isolates tenants and preserves immutable evidence snapshots', async () => {
    const db = new FakeFirestore();
    const tenant = new TenantContext();
    const repository = new FireSafeRepository({ db } as never, tenant);
    let recordId = '';
    await tenant.run(principal('tenant-a'), async () => {
      const created = await repository.create({ name: 'Merkez Bina', location: 'İstanbul', inspectionDueAt: '2026-12-15T09:00:00.000Z' });
      recordId = created.id;
      await repository.update(recordId, { expectedVersion: 1, status: 'active' });
      const snapshots = await db.collection(`tenants/tenant-a/${FIRE_SAFE_COLLECTIONS.snapshots}`).get();
      expect(snapshots.docs).toHaveLength(2);
      expect(snapshots.docs[0]!.data()?.['immutable']).toBe(true);
    });
    await tenant.run(principal('tenant-b'), async () => {
      const result = await repository.list({ archived: false, limit: 25 });
      expect(result.items).toHaveLength(0);
      await expect(repository.get(recordId)).rejects.toMatchObject({ code: 'COMPLIANCE_RECORD_NOT_FOUND' });
    });
  });

  it('soft deletes and restores without losing the record', async () => {
    const db = new FakeFirestore();
    const tenant = new TenantContext();
    const repository = new FireSafeRepository({ db } as never, tenant);
    await tenant.run(principal('tenant-a'), async () => {
      const created = await repository.create({ name: 'Depo Sprinkler Sistemi', location: 'Ankara' });
      expect((await repository.archive(created.id)).archivedAt).toBeTruthy();
      expect((await repository.list({ archived: true, limit: 25 })).items).toHaveLength(1);
      expect((await repository.restore(created.id)).archivedAt).toBeNull();
    });
  });
});
