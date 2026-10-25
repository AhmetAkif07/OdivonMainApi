import { FakeFirestore } from '../../../shared/testing/fake-firestore';
import { ClientVersionTracker, moduleFromRoute } from './client-version-tracker.service';
import { PlatformReleasesService, sortReleases, versionStatus } from './releases.service';
import { PlatformRelease } from './release.types';

const admin = { uid: 'admin1', email: 'admin@odivon.com' } as never;

function setup() {
  const db = new FakeFirestore();
  const firebase = { db } as never;
  const audit = { record: jest.fn().mockResolvedValue(undefined) } as never;
  return { db, releases: new PlatformReleasesService(firebase, audit), tracker: new ClientVersionTracker(firebase) };
}

describe('release helpers', () => {
  it('sorts by version number, not text', () => {
    const items = ['1.2.0', '1.10.0', '1.9.3'].map((version) => ({ version, releasedAt: '2026-01-01' }) as PlatformRelease);
    expect(sortReleases(items).map((r) => r.version)).toEqual(['1.10.0', '1.9.3', '1.2.0']);
  });

  it('compares a tenant version with the latest release', () => {
    expect(versionStatus('1.2.0', '1.3.0')).toBe('outdated');
    expect(versionStatus('1.3.0', '1.3.0')).toBe('up_to_date');
    expect(versionStatus('1.4.0', '1.3.0')).toBe('ahead');
    expect(versionStatus(null, '1.3.0')).toBe('unknown');
  });

  it('maps routes to product modules', () => {
    expect(moduleFromRoute('gym', ['gym', 'spa'])).toBe('gym');
    expect(moduleFromRoute('driving-school', [])).toBe('drivingschool');
    expect(moduleFromRoute('identity', ['vet'])).toBe('vet');
    expect(moduleFromRoute('identity', ['vet', 'gym'])).toBeNull();
  });
});

describe('PlatformReleasesService', () => {
  it('rejects a duplicate version of the same module', async () => {
    const { releases } = setup();
    await releases.create({ module: 'gym', version: '1.0.0', title: 'İlk' }, admin);
    await expect(releases.create({ module: 'gym', version: '1.0.0', title: 'Tekrar' }, admin)).rejects.toThrow();
    await expect(releases.create({ module: 'vet', version: '1.0.0', title: 'Vet' }, admin)).resolves.toBeDefined();
  });

  it('reports tenants on old and current versions', async () => {
    const { db, releases, tracker } = setup();
    await db.doc('tenants/t1').set({ id: 't1', modules: ['gym'], name: 'A' });
    await db.doc('tenants/t2').set({ id: 't2', modules: ['gym'], name: 'B' });
    await db.doc('tenants/t3').set({ id: 't3', modules: ['gym'], name: 'C' });
    await releases.create({ module: 'gym', version: '1.1.0', title: 'Yeni' }, admin);
    await releases.create({ module: 'gym', version: '1.0.0', title: 'Eski', releasedAt: '2026-01-01T00:00:00Z' }, admin);

    await tracker.record({ tenantId: 't1', module: 'gym', version: '1.0.0', userId: 'u1' });
    await tracker.record({ tenantId: 't2', module: 'gym', version: '1.1.0', userId: 'u2' });

    const overview = await releases.overview();
    const gym = overview.modules.find((m) => m.module === 'gym')!;
    expect(gym.latest?.version).toBe('1.1.0');
    expect(gym).toMatchObject({ tenantCount: 3, reportedCount: 2, notReportedCount: 1, upToDateCount: 1, outdatedCount: 1 });

    const t1 = await releases.tenantVersions('t1');
    expect(t1.modules[0]).toMatchObject({ module: 'gym', status: 'outdated', current: { version: '1.0.0' } });
  });
});

describe('ClientVersionTracker', () => {
  it('writes history only when the version changes', async () => {
    const { db, tracker } = setup();
    await db.doc('tenants/t1').set({ id: 't1', modules: ['gym'] });
    await tracker.record({ tenantId: 't1', module: 'gym', version: '1.0.0' });
    await tracker.record({ tenantId: 't1', module: 'gym', version: '1.0.0' });
    await tracker.record({ tenantId: 't1', module: 'gym', version: '1.1.0' });
    await tracker.record({ tenantId: 't1', module: 'gym', version: 'not-a-version' });

    const history = (await db.collection('tenants/t1/versionHistory').get()).docs.map((d) => d.data());
    expect(history.map((h) => [h!['fromVersion'], h!['toVersion']])).toEqual([
      [null, '1.0.0'],
      ['1.0.0', '1.1.0'],
    ]);
    const tenant = (await db.doc('tenants/t1').get()).data()!;
    expect((tenant['clientVersions'] as Record<string, { version: string }>).gym.version).toBe('1.1.0');
  });

  it('ignores unknown tenants', async () => {
    const { db, tracker } = setup();
    await tracker.record({ tenantId: 'missing', module: 'gym', version: '1.0.0' });
    expect(db.docs.size).toBe(0);
  });
});
