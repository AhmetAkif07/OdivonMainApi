import { FakeFirestore } from '../../../shared/testing/fake-firestore';
import { fillPlaceholders, placeholdersIn } from './contract-render';
import { CONTRACT_PLACEHOLDERS, SAMPLE_CLAUSES, sampleClausesFor } from './contract-samples';
import { PlatformContractsService, nextContractVersion } from './contracts.service';

const admin = { uid: 'admin1', email: 'admin@odivon.com' } as never;

function setup() {
  const db = new FakeFirestore();
  const firebase = { db } as never;
  const audit = { record: jest.fn().mockResolvedValue(undefined) } as never;
  return { db, contracts: new PlatformContractsService(firebase, audit) };
}

describe('contract samples', () => {
  it('only uses known placeholders', () => {
    const known = new Set(CONTRACT_PLACEHOLDERS.map((p) => p.key));
    for (const clause of SAMPLE_CLAUSES) {
      for (const key of placeholdersIn(`${clause.title} ${clause.body}`)) {
        expect(known.has(key) ? key : `${clause.id}: ${key}`).toBe(key);
      }
    }
  });

  it('adds product-specific liability clauses only to that product', () => {
    const gym = sampleClausesFor('sales', 'gym').map((c) => c.id);
    const vet = sampleClausesFor('sales', 'vet').map((c) => c.id);
    expect(gym).toContain('gym:saglik-verisi');
    expect(gym).toContain('gen:sorumluluk-siniri');
    expect(vet).toContain('vet:mesleki-sorumluluk');
    expect(vet).not.toContain('gym:saglik-verisi');
    expect(sampleClausesFor('sales', 'fgas').map((c) => c.id)).toContain('compliance:danismanlik-degil');
  });

  it('keeps missing placeholders readable', () => {
    const r = fillPlaceholders('{{satici_unvan}} ile {{alici_unvan}}', { satici_unvan: 'Odivon A.Ş.' });
    expect(r.text).toBe('Odivon A.Ş. ile [Alıcı (işletme) unvanı]');
    expect(r.missing).toEqual(['alici_unvan']);
  });

  it('bumps versions', () => {
    expect(nextContractVersion('1.0')).toBe('1.1');
    expect(nextContractVersion('2')).toBe('3');
  });
});

describe('PlatformContractsService', () => {
  it('creates a gym sales contract from samples as an unreviewed draft', async () => {
    const { contracts } = setup();
    const c = await contracts.createFromSample({ kind: 'sales', product: 'gym' }, admin);
    expect(c.status).toBe('draft');
    expect(c.legalReviewed).toBe(false);
    expect(c.title).toContain('Spor Salonu');
    expect(c.clauses.length).toBeGreaterThan(5);
  });

  it('keeps one active contract per product and kind', async () => {
    const { contracts } = setup();
    const first = await contracts.createFromSample({ kind: 'sales', product: 'gym' }, admin);
    await contracts.activate(first.id, admin);
    const second = await contracts.duplicate(first.id, admin);
    expect(second.version).toBe('1.1');
    const result = await contracts.activate(second.id, admin);
    expect(result.archived).toEqual([first.id]);

    const overview = await contracts.products();
    const gym = overview.products.find((p) => p.product === 'gym')!;
    expect(gym.sales?.id).toBe(second.id);
    expect(gym.sales?.version).toBe('1.1');
    expect(overview.products.find((p) => p.product === 'vet')!.sales).toBeNull();
  });

  it('refuses to delete an active contract', async () => {
    const { contracts } = setup();
    const c = await contracts.createFromSample({ kind: 'sales', product: 'vet' }, admin);
    await contracts.activate(c.id, admin);
    await expect(contracts.remove(c.id, admin)).rejects.toThrow();
  });

  it('clears the legal review flag when the text changes', async () => {
    const { contracts } = setup();
    const c = await contracts.createFromSample({ kind: 'sales', product: 'hair' }, admin);
    const reviewed = await contracts.update(c.id, { legalReviewed: true }, admin);
    expect(reviewed.legalReviewed).toBe(true);
    const edited = await contracts.update(c.id, { title: 'Yeni başlık' }, admin);
    expect(edited.legalReviewed).toBe(false);
  });

  it('fills seller details in the preview and falls back to the general contract publicly', async () => {
    const { contracts, db } = setup();
    await contracts.updateParty({ companyName: 'Odivon Yazılım A.Ş.', shortName: 'Odivon' }, admin);
    await db.doc('tenants/t1').set({ id: 't1', name: 'Demo Spor', ownerUid: 'u1' });
    await db.doc('users/u1').set({ email: 'owner@demo.com' });
    const c = await contracts.createFromSample({ kind: 'sales', product: 'gym' }, admin);
    const preview = await contracts.preview(c.id, { tenantId: 't1' });
    const parties = preview.clauses.find((x) => x.title === 'Taraflar')!;
    expect(parties.body).toContain('Odivon Yazılım A.Ş.');
    expect(parties.body).toContain('Demo Spor');
    expect(preview.missing.map((m) => m.key)).toContain('satici_vergi_no');

    const general = await contracts.createFromSample({ kind: 'kvkk_notice', product: 'all' }, admin);
    await contracts.activate(general.id, admin);
    await expect(contracts.activeFor('gym', 'kvkk_notice')).resolves.toMatchObject({ id: general.id });
    await expect(contracts.activeFor('gym', 'sales')).rejects.toThrow();
  });
});
