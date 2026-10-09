import { FirebaseService } from '../../../shared/firebase/firebase.service';
import { TENANT_COLLECTION, tenantCollectionPath } from '../../../shared/firebase/firestore-path';
import { createBaseFields } from '../../../shared/firestore/base-document';
import { ProductModule } from '../../../shared/authorization/constants';

export async function seedDemoDataForModule(
  firebase: FirebaseService,
  tenantId: string,
  userId: string,
  module: ProductModule,
  tenantName: string,
): Promise<void> {
  const now = new Date().toISOString();
  const db = firebase.db;

  if (module === 'gym') {
    // 1. Branch
    const branchRef = db.collection(tenantCollectionPath(tenantId, TENANT_COLLECTION.gymBranches)).doc();
    await branchRef.set({
      ...createBaseFields(branchRef.id, userId, now),
      name: `${tenantName} - Merkez Şube`,
      address: 'Örnek Mah. Spor Cad. No:1',
      city: 'İstanbul',
      phone: '0212 555 0101',
      email: 'info@gymdemo.com',
      capacity: 200,
      features: ['Fitness', 'Pilates', 'Kardiyo Alanı', 'Sauna'],
      openDays: [1, 2, 3, 4, 5, 6, 0],
      openingHours: [0, 1, 2, 3, 4, 5, 6].map((day) => ({
        day,
        open: '07:00',
        close: '23:00',
        closed: false,
      })),
    });

    // 2. Packages
    const pkgCol = db.collection(tenantCollectionPath(tenantId, TENANT_COLLECTION.gymPackages));
    const packages = [
      { name: '1 Aylık Fitness', durationDays: 30, price: 1500, features: ['Fitness'] },
      { name: '3 Aylık Full Paket', durationDays: 90, price: 3800, features: ['Fitness', 'Grup Dersleri'] },
      { name: '1 Yıllık VIP', durationDays: 365, price: 12000, features: ['Fitness', 'Grup Dersleri', 'Özel Dolap'] },
    ];
    for (const p of packages) {
      const ref = pkgCol.doc();
      await ref.set({ ...createBaseFields(ref.id, userId, now), ...p });
    }

    // 3. Disciplines
    const discCol = db.collection(tenantCollectionPath(tenantId, TENANT_COLLECTION.gymDisciplines));
    const disciplines = [
      { name: 'Fitness & Vücut Geliştirme', code: 'FIT' },
      { name: 'Reformer Pilates', code: 'PIL' },
      { name: 'Fonksiyonel Antrenman', code: 'CROSS' },
    ];
    for (const d of disciplines) {
      const ref = discCol.doc();
      await ref.set({ ...createBaseFields(ref.id, userId, now), ...d });
    }
  } else if (module === 'vet') {
    // 1. Vaccine definitions
    const vacCol = db.collection(tenantCollectionPath(tenantId, TENANT_COLLECTION.vaccines));
    const vaccines = [
      { name: 'Karma Aşı (Köpek)', targetSpecies: 'dog', periodDays: 365 },
      { name: 'Kuduz Aşısı', targetSpecies: 'all', periodDays: 365 },
      { name: 'Lösemi Aşısı (Kedi)', targetSpecies: 'cat', periodDays: 365 },
    ];
    for (const v of vaccines) {
      const ref = vacCol.doc();
      await ref.set({ ...createBaseFields(ref.id, userId, now), ...v });
    }

    // 2. Product Categories
    const catCol = db.collection(tenantCollectionPath(tenantId, TENANT_COLLECTION.productCategories));
    const categories = [
      { name: 'İlaç & Aşı', code: 'MED' },
      { name: 'Mama & Beslenme', code: 'FOOD' },
      { name: 'Aksesuar & Bakım', code: 'ACC' },
    ];
    for (const c of categories) {
      const ref = catCol.doc();
      await ref.set({ ...createBaseFields(ref.id, userId, now), ...c });
    }
  } else if (module === 'farm') {
    // 1. Farm settings
    const settingsRef = db.doc(`tenants/${tenantId}/${TENANT_COLLECTION.farmSettings}/${tenantId}`);
    await settingsRef.set(
      {
        address: 'Örnek Çiftlik Yolu No:5',
        phone: '0555 123 4567',
        country: 'Türkiye',
        countryCode: 'TR',
        language: 'tr',
        updatedAt: now,
        updatedBy: userId,
      },
      { merge: true },
    );

    // 2. Farm admin member card
    const memberRef = db.doc(`tenants/${tenantId}/${TENANT_COLLECTION.farmMembers}/${userId}`);
    await memberRef.set(
      {
        ...createBaseFields(userId, userId, now),
        farmId: tenantId,
        uid: userId,
        role: 'admin',
        status: 'active',
        title: 'Çiftlik Yöneticisi',
        addedAt: now,
      },
      { merge: true },
    );
  }
}
