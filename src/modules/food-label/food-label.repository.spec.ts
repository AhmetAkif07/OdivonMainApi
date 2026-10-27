import { FakeFirestore } from '../../shared/testing/fake-firestore';
import { TenantContext, TenantStore } from '../../shared/tenancy/tenant.context';
import { FoodLabelRepository } from './food-label.repository';
import { FOOD_LABEL_COLLECTIONS } from './food-label.constants';

const principal = (tenantId: string): TenantStore => ({
  tenantId,
  userId: `${tenantId}-user`,
  role: 'owner',
  modules: ['food-label'],
  email: `${tenantId}@example.test`,
});

describe('FoodLabelRepository', () => {
  it('isolates tenants and preserves immutable evidence snapshots', async () => {
    const db = new FakeFirestore();
    const tenant = new TenantContext();
    const repository = new FoodLabelRepository({ db } as never, tenant);
    let recordId = '';
    await tenant.run(principal('tenant-a'), async () => {
      const created = await repository.create({
        kind: 'product',
        name: 'Fındıklı Granola',
        location: 'İstanbul Fabrika',
        sku: 'GRN-001',
        ingredients: 'Yulaf, fındık',
        allergens: ['Fındık', 'Gluten'],
      });
      recordId = created.id;
      await repository.update(recordId, { expectedVersion: 1, status: 'in-review' });
      const snapshots = await db
        .collection(`tenants/tenant-a/${FOOD_LABEL_COLLECTIONS.snapshots}`)
        .get();
      expect(snapshots.docs).toHaveLength(2);
      expect(snapshots.docs[0]!.data()?.['immutable']).toBe(true);
    });
    await tenant.run(principal('tenant-b'), async () => {
      const result = await repository.list({ archived: false, limit: 25 });
      expect(result.items).toHaveLength(0);
      await expect(repository.get(recordId)).rejects.toMatchObject({
        code: 'COMPLIANCE_RECORD_NOT_FOUND',
      });
    });
  });

  it('soft deletes and restores without losing the record', async () => {
    const db = new FakeFirestore();
    const tenant = new TenantContext();
    const repository = new FoodLabelRepository({ db } as never, tenant);
    await tenant.run(principal('tenant-a'), async () => {
      const created = await repository.create({
        kind: 'product',
        name: 'Yoğurt 500 g',
        location: 'Ankara Fabrika',
      });
      expect((await repository.archive(created.id)).archivedAt).toBeTruthy();
      expect((await repository.list({ archived: true, limit: 25 })).items).toHaveLength(1);
      expect((await repository.restore(created.id)).archivedAt).toBeNull();
    });
  });

  it('blocks incomplete approvals and produces dashboard, audit and compliance evidence', async () => {
    const db = new FakeFirestore();
    const tenant = new TenantContext();
    const repository = new FoodLabelRepository({ db } as never, tenant);
    await tenant.run(principal('tenant-a'), async () => {
      await expect(
        repository.create({
          kind: 'approval',
          name: 'AB etiket onayı',
          location: 'İstanbul Fabrika',
          status: 'approved',
        }),
      ).rejects.toMatchObject({ code: 'COMPLIANCE_RECORD_INVALID' });

      const created = await repository.create({
        kind: 'approval',
        name: 'AB etiket onayı',
        location: 'İstanbul Fabrika',
        market: 'EU',
        responsibleName: 'Mevzuat Ekibi',
        approvedAt: new Date().toISOString(),
        documentRefs: ['ARTWORK-v3'],
        status: 'approved',
      });
      const dashboard = await repository.dashboard();
      expect(dashboard).toMatchObject({
        total: 1,
        approvals: 1,
        approved: 1,
        complianceScore: 100,
      });
      expect(await repository.audit(created.id)).toHaveLength(1);
      const report = await repository.complianceReport();
      expect(report).toMatchObject({ schemaVersion: 1, tenantId: 'tenant-a' });
      expect(report.records).toHaveLength(1);
      expect(report.audit).toHaveLength(1);
    });
  });
});
