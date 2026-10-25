import { FakeFirestore } from '../../shared/testing/fake-firestore';
import { TenantContext, TenantStore } from '../../shared/tenancy/tenant.context';
import { FgasRepository } from './fgas.repository';
import { FGAS_COLLECTIONS } from './fgas.constants';

const principal = (tenantId: string): TenantStore => ({
  tenantId,
  userId: `${tenantId}-user`,
  role: 'owner',
  modules: ['fgas'],
  email: `${tenantId}@example.test`,
});

describe('FgasRepository', () => {
  it('isolates tenants and preserves immutable evidence snapshots', async () => {
    const db = new FakeFirestore();
    const tenant = new TenantContext();
    const repository = new FgasRepository({ db } as never, tenant);
    let recordId = '';
    await tenant.run(principal('tenant-a'), async () => {
      const created = await repository.create({
        name: 'Chiller A',
        location: 'İstanbul',
        equipmentType: 'stationary-refrigeration',
        refrigerant: 'R32',
        refrigerantChargeKg: 18.5,
        co2EquivalentTonnes: 12.5,
      });
      recordId = created.id;
      await repository.update(recordId, { expectedVersion: 1, status: 'active' });
      const snapshots = await db.collection(`tenants/tenant-a/${FGAS_COLLECTIONS.snapshots}`).get();
      expect(snapshots.docs).toHaveLength(2);
      expect(snapshots.docs[0]!.data()?.['immutable']).toBe(true);
      expect(await repository.audit(recordId)).toHaveLength(2);
      await repository.update(recordId, { expectedVersion: 2, status: 'action-required' });
      await expect(
        repository.update(recordId, { expectedVersion: 2, status: 'active' }),
      ).rejects.toMatchObject({ code: 'COMPLIANCE_RECORD_CONFLICT' });
      expect(await repository.dashboard()).toMatchObject({
        totalEquipment: 1,
        actionRequired: 1,
        refrigerantChargeKg: 18.5,
      });
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
    const repository = new FgasRepository({ db } as never, tenant);
    await tenant.run(principal('tenant-a'), async () => {
      const created = await repository.create({
        name: 'Rooftop 24',
        location: 'Ankara',
        equipmentType: 'air-conditioning',
      });
      expect((await repository.archive(created.id)).archivedAt).toBeTruthy();
      expect((await repository.list({ archived: true, limit: 25 })).items).toHaveLength(1);
      expect((await repository.restore(created.id)).archivedAt).toBeNull();
    });
  });

  it('stores operational records per tenant with optimistic versioning and immutable evidence', async () => {
    const db = new FakeFirestore();
    const tenant = new TenantContext();
    const repository = new FgasRepository({ db } as never, tenant);
    await tenant.run(principal('tenant-a'), async () => {
      const created = await repository.createOperation('leak-check', {
        title: 'Chiller periyodik kontrol',
        equipmentId: 'eq-1',
        status: 'scheduled',
        dueAt: '2026-11-10',
        technicianName: 'Ayşe Usta',
      });
      expect(
        (await repository.listOperations('leak-check', { archived: false, limit: 25 })).items,
      ).toHaveLength(1);
      const updated = await repository.updateOperation('leak-check', created.id, {
        expectedVersion: 1,
        title: created.title,
        status: 'completed',
        result: 'pass',
        occurredAt: '2026-11-01',
        technicianName: 'Ayşe Usta',
      });
      expect(updated).toMatchObject({ version: 2, status: 'completed', result: 'pass' });
      await expect(
        repository.updateOperation('leak-check', created.id, {
          expectedVersion: 1,
          title: created.title,
        }),
      ).rejects.toMatchObject({ code: 'COMPLIANCE_RECORD_CONFLICT' });
      await repository.setOperationArchive('leak-check', created.id, true);
      expect(
        (await repository.listOperations('leak-check', { archived: true, limit: 25 })).items,
      ).toHaveLength(1);
      const snapshots = await db.collection(`tenants/tenant-a/${FGAS_COLLECTIONS.snapshots}`).get();
      expect(snapshots.docs).toHaveLength(3);
    });
    await tenant.run(principal('tenant-b'), async () => {
      expect(
        (await repository.listOperations('leak-check', { archived: false, limit: 25 })).items,
      ).toHaveLength(0);
    });
  });
});
