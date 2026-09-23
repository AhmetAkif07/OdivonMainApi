import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const TAXES = [
  { id: 'seed-tax-0', name: 'KDV %0', ratio: 0, type: 'both' },
  { id: 'seed-tax-1', name: 'KDV %1', ratio: 1, type: 'both' },
  { id: 'seed-tax-10', name: 'KDV %10', ratio: 10, type: 'both' },
  { id: 'seed-tax-20', name: 'KDV %20', ratio: 20, type: 'both' },
];

const UNITS = [
  { id: 'seed-unit-adet', name: 'Adet', code: 'ADT' },
  { id: 'seed-unit-kutu', name: 'Kutu', code: 'KT' },
  { id: 'seed-unit-sise', name: 'Şişe', code: 'SS' },
  { id: 'seed-unit-ml', name: 'Mililitre', code: 'ML' },
  { id: 'seed-unit-gr', name: 'Gram', code: 'GR' },
  { id: 'seed-unit-kg', name: 'Kilogram', code: 'KG' },
  { id: 'seed-unit-tablet', name: 'Tablet', code: 'TB' },
  { id: 'seed-unit-doz', name: 'Doz', code: 'DZ' },
];

const CATEGORIES = [
  { id: 'seed-cat-mama', name: 'Mama', code: 'GID' },
  { id: 'seed-cat-asi', name: 'Aşı', code: 'ASI' },
  { id: 'seed-cat-ilac', name: 'İlaç', code: 'ILC' },
  { id: 'seed-cat-parazit', name: 'Antiparaziter', code: 'APR' },
  { id: 'seed-cat-aksesuar', name: 'Aksesuar', code: 'AKS' },
  { id: 'seed-cat-bakim', name: 'Bakım ve hijyen', code: 'BKM' },
  { id: 'seed-cat-hizmet', name: 'Muayene ve işlem', code: 'HZM' },
  { id: 'seed-cat-lab', name: 'Laboratuvar', code: 'LAB' },
];

const STORES = [
  { id: 'seed-store-ana', name: 'Ana depo', code: 'D01', active: true },
  { id: 'seed-store-raf', name: 'Klinik satış rafı', code: 'D02', active: true },
  { id: 'seed-store-soguk', name: 'Soğuk zincir dolabı', code: 'D03', active: true },
];

const SUPPLIERS = [
  {
    id: 'seed-sup-vetmed',
    name: 'VetMed Ecza Deposu',
    companyName: 'VetMed Veteriner Ecza Deposu Ltd. Şti.',
    email: 'siparis@vetmed.example.com',
    phone: '0212 555 10 10',
    address: 'İkitelli OSB, Başakşehir / İstanbul',
    taxOffice: 'İkitelli',
    taxNumber: '1234567890',
    mersisNo: '0123456789000015',
    website: 'https://vetmed.example.com',
    invoiceType: 'e-invoice',
    active: true,
  },
  {
    id: 'seed-sup-petfood',
    name: 'PetFood Dağıtım',
    companyName: 'PetFood Gıda Dağıtım A.Ş.',
    email: 'info@petfood.example.com',
    phone: '0216 444 20 20',
    address: 'Tuzla / İstanbul',
    taxOffice: 'Tuzla',
    taxNumber: '2345678901',
    mersisNo: null,
    website: null,
    invoiceType: 'e-invoice',
    active: true,
  },
  {
    id: 'seed-sup-aksesuar',
    name: 'Pati Aksesuar',
    companyName: 'Pati Evcil Hayvan Ürünleri',
    email: 'satis@patiaksesuar.example.com',
    phone: '0232 333 30 30',
    address: 'Bornova / İzmir',
    taxOffice: 'Bornova',
    taxNumber: '3456789012',
    mersisNo: null,
    website: null,
    invoiceType: 'e-archive',
    active: true,
  },
  {
    id: 'seed-sup-lab',
    name: 'Anadolu Vet Lab',
    companyName: 'Anadolu Veteriner Laboratuvar Hizmetleri',
    email: 'lab@anadoluvet.example.com',
    phone: '0312 222 40 40',
    address: 'Çankaya / Ankara',
    taxOffice: 'Çankaya',
    taxNumber: '4567890123',
    mersisNo: null,
    website: null,
    invoiceType: 'paper',
    active: true,
  },
];

const PAYMENT_METHODS = [
  { id: 'seed-pay-nakit', name: 'Nakit', remark: 'Kasaya nakit tahsilat' },
  { id: 'seed-pay-kart', name: 'Kredi kartı', remark: 'POS cihazı ile tahsilat' },
  { id: 'seed-pay-havale', name: 'Havale / EFT', remark: 'Banka hesabına transfer' },
  { id: 'seed-pay-veresiye', name: 'Veresiye', remark: 'Müşteri cari hesabına yazılır' },
];

const CASH_REGISTERS = [
  { id: 'seed-cash-merkez', name: 'Merkez kasa', active: true },
  { id: 'seed-cash-pos', name: 'POS hesabı', active: true },
  { id: 'seed-cash-banka', name: 'Banka hesabı', active: true },
];

const CUSTOMER_GROUPS = [
  { id: 'seed-grp-standart', name: 'Standart', code: 'STD' },
  { id: 'seed-grp-vip', name: 'VIP', code: 'VIP' },
  { id: 'seed-grp-barinak', name: 'Barınak / dernek', code: 'BRN' },
  { id: 'seed-grp-ciftlik', name: 'Çiftlik', code: 'CFT' },
  { id: 'seed-grp-personel', name: 'Personel', code: 'PRS' },
];

const APPOINTMENT_TYPES = [
  { id: 'seed-apt-muayene', name: 'Muayene', price: 500, color: '#6366f1', taxId: 'seed-tax-20', isDefaultPrice: true, remark: 'Genel muayene' },
  { id: 'seed-apt-asi', name: 'Aşı', price: 400, color: '#10b981', taxId: 'seed-tax-20', isDefaultPrice: false, remark: 'Aşı uygulaması (aşı bedeli ayrı)' },
  { id: 'seed-apt-kontrol', name: 'Kontrol', price: 250, color: '#0ea5e9', taxId: 'seed-tax-20', isDefaultPrice: true, remark: 'Tedavi sonrası kontrol' },
  { id: 'seed-apt-ameliyat', name: 'Ameliyat', price: 3000, color: '#ef4444', taxId: 'seed-tax-20', isDefaultPrice: false, remark: 'Operasyon ücreti vakaya göre değişir' },
  { id: 'seed-apt-dis', name: 'Diş taşı temizliği', price: 1500, color: '#f59e0b', taxId: 'seed-tax-20', isDefaultPrice: true, remark: null },
  { id: 'seed-apt-acil', name: 'Acil', price: 1000, color: '#dc2626', taxId: 'seed-tax-20', isDefaultPrice: true, remark: 'Mesai dışı acil başvuru' },
  { id: 'seed-apt-bakim', name: 'Tıraş ve bakım', price: 600, color: '#a855f7', taxId: 'seed-tax-20', isDefaultPrice: true, remark: null },
];

const product = (fields) => ({
  productType: 'product',
  code: null,
  barcode: null,
  categoryId: null,
  unitId: 'seed-unit-adet',
  taxId: 'seed-tax-20',
  supplierId: null,
  storeId: 'seed-store-raf',
  buyingPrice: 0,
  sellingPrice: 0,
  vatIncluded: true,
  criticalAmount: null,
  animalType: null,
  active: true,
  ...fields,
});

const service = (fields) =>
  product({
    productType: 'service',
    categoryId: 'seed-cat-hizmet',
    unitId: 'seed-unit-adet',
    supplierId: null,
    storeId: null,
    criticalAmount: null,
    ...fields,
  });

const PRODUCTS = [
  product({ id: 'seed-prd-mama-kopek', name: 'Yetişkin köpek maması 15 kg', code: 'MAM-001', barcode: '8690000000011', categoryId: 'seed-cat-mama', unitId: 'seed-unit-adet', taxId: 'seed-tax-1', supplierId: 'seed-sup-petfood', storeId: 'seed-store-ana', buyingPrice: 1450, sellingPrice: 1950, criticalAmount: 5, animalType: 'Köpek' }),
  product({ id: 'seed-prd-mama-kedi', name: 'Kısırlaştırılmış kedi maması 2 kg', code: 'MAM-002', barcode: '8690000000028', categoryId: 'seed-cat-mama', taxId: 'seed-tax-1', supplierId: 'seed-sup-petfood', storeId: 'seed-store-raf', buyingPrice: 520, sellingPrice: 720, criticalAmount: 8, animalType: 'Kedi' }),
  product({ id: 'seed-prd-yas-mama', name: 'Kedi yaş mama 85 g', code: 'MAM-003', categoryId: 'seed-cat-mama', taxId: 'seed-tax-1', supplierId: 'seed-sup-petfood', buyingPrice: 28, sellingPrice: 45, criticalAmount: 48, animalType: 'Kedi' }),
  product({ id: 'seed-prd-karma', name: 'Karma aşı (DHPPi+L)', code: 'ASI-001', categoryId: 'seed-cat-asi', unitId: 'seed-unit-doz', taxId: 'seed-tax-10', supplierId: 'seed-sup-vetmed', storeId: 'seed-store-soguk', buyingPrice: 180, sellingPrice: 450, criticalAmount: 10, animalType: 'Köpek' }),
  product({ id: 'seed-prd-kuduz', name: 'Kuduz aşısı', code: 'ASI-002', categoryId: 'seed-cat-asi', unitId: 'seed-unit-doz', taxId: 'seed-tax-10', supplierId: 'seed-sup-vetmed', storeId: 'seed-store-soguk', buyingPrice: 120, sellingPrice: 350, criticalAmount: 10 }),
  product({ id: 'seed-prd-kedi-karma', name: 'Kedi karma aşısı (FVRCP)', code: 'ASI-003', categoryId: 'seed-cat-asi', unitId: 'seed-unit-doz', taxId: 'seed-tax-10', supplierId: 'seed-sup-vetmed', storeId: 'seed-store-soguk', buyingPrice: 160, sellingPrice: 420, criticalAmount: 10, animalType: 'Kedi' }),
  product({ id: 'seed-prd-antibiyotik', name: 'Amoksisilin 250 mg tablet', code: 'ILC-001', categoryId: 'seed-cat-ilac', unitId: 'seed-unit-kutu', taxId: 'seed-tax-10', supplierId: 'seed-sup-vetmed', storeId: 'seed-store-ana', buyingPrice: 95, sellingPrice: 190, criticalAmount: 6 }),
  product({ id: 'seed-prd-agri', name: 'Meloksikam oral süspansiyon', code: 'ILC-002', categoryId: 'seed-cat-ilac', unitId: 'seed-unit-sise', taxId: 'seed-tax-10', supplierId: 'seed-sup-vetmed', storeId: 'seed-store-ana', buyingPrice: 140, sellingPrice: 280, criticalAmount: 4 }),
  product({ id: 'seed-prd-damla', name: 'Dış parazit damlası (kedi)', code: 'APR-001', categoryId: 'seed-cat-parazit', unitId: 'seed-unit-adet', taxId: 'seed-tax-10', supplierId: 'seed-sup-vetmed', buyingPrice: 110, sellingPrice: 230, criticalAmount: 12, animalType: 'Kedi' }),
  product({ id: 'seed-prd-ic-parazit', name: 'İç parazit tableti (köpek)', code: 'APR-002', categoryId: 'seed-cat-parazit', unitId: 'seed-unit-tablet', taxId: 'seed-tax-10', supplierId: 'seed-sup-vetmed', buyingPrice: 45, sellingPrice: 110, criticalAmount: 20, animalType: 'Köpek' }),
  product({ id: 'seed-prd-tasma', name: 'Deri tasma (orta boy)', code: 'AKS-001', categoryId: 'seed-cat-aksesuar', taxId: 'seed-tax-20', supplierId: 'seed-sup-aksesuar', buyingPrice: 150, sellingPrice: 290, criticalAmount: 3, animalType: 'Köpek' }),
  product({ id: 'seed-prd-tasima', name: 'Kedi taşıma çantası', code: 'AKS-002', categoryId: 'seed-cat-aksesuar', taxId: 'seed-tax-20', supplierId: 'seed-sup-aksesuar', storeId: 'seed-store-ana', buyingPrice: 380, sellingPrice: 650, criticalAmount: 2, animalType: 'Kedi' }),
  product({ id: 'seed-prd-sampuan', name: 'Hipoalerjenik şampuan', code: 'BKM-001', categoryId: 'seed-cat-bakim', unitId: 'seed-unit-sise', taxId: 'seed-tax-20', supplierId: 'seed-sup-aksesuar', buyingPrice: 90, sellingPrice: 175, criticalAmount: 6 }),
  product({ id: 'seed-prd-kum', name: 'Bentonit kedi kumu 10 L', code: 'BKM-002', categoryId: 'seed-cat-bakim', taxId: 'seed-tax-20', supplierId: 'seed-sup-petfood', storeId: 'seed-store-ana', buyingPrice: 120, sellingPrice: 199, criticalAmount: 10, animalType: 'Kedi' }),
  service({ id: 'seed-srv-muayene', name: 'Genel muayene', code: 'HZM-001', sellingPrice: 500 }),
  service({ id: 'seed-srv-kontrol', name: 'Kontrol muayenesi', code: 'HZM-002', sellingPrice: 250 }),
  service({ id: 'seed-srv-asi-uygulama', name: 'Aşı uygulama ücreti', code: 'HZM-003', sellingPrice: 150 }),
  service({ id: 'seed-srv-kisirlastirma-kedi', name: 'Kısırlaştırma (dişi kedi)', code: 'HZM-004', sellingPrice: 3500, animalType: 'Kedi' }),
  service({ id: 'seed-srv-dis', name: 'Diş taşı temizliği', code: 'HZM-005', sellingPrice: 1500 }),
  service({ id: 'seed-srv-mikrocip', name: 'Mikroçip uygulaması', code: 'HZM-006', sellingPrice: 400 }),
  service({ id: 'seed-srv-hemogram', name: 'Hemogram (tam kan sayımı)', code: 'LAB-001', categoryId: 'seed-cat-lab', supplierId: 'seed-sup-lab', sellingPrice: 450 }),
  service({ id: 'seed-srv-biyokimya', name: 'Biyokimya paneli', code: 'LAB-002', categoryId: 'seed-cat-lab', supplierId: 'seed-sup-lab', sellingPrice: 750 }),
  service({ id: 'seed-srv-rontgen', name: 'Röntgen (tek poz)', code: 'HZM-007', sellingPrice: 600 }),
];

const COLLECTIONS = [
  ['taxes', TAXES],
  ['units', UNITS],
  ['productCategories', CATEGORIES],
  ['stores', STORES],
  ['suppliers', SUPPLIERS],
  ['paymentMethods', PAYMENT_METHODS],
  ['cashRegisters', CASH_REGISTERS],
  ['customerGroups', CUSTOMER_GROUPS],
  ['appointmentTypes', APPOINTMENT_TYPES],
  ['products', PRODUCTS],
];

function loadEnv(filePath) {
  const text = readFileSync(filePath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const eq = trimmed.indexOf('=');
    if (eq < 0) {
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadEnv(resolve(import.meta.dirname, '..', '.env'));

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
if (!projectId || !clientEmail || !privateKey) {
  throw new Error('Firebase kimlik bilgileri eksik');
}

const app =
  getApps()[0] ??
  initializeApp({
    projectId,
    credential: cert({ projectId, clientEmail, privateKey }),
  });
const db = getFirestore(app);

const usersSnap = await db.collection('users').get();
const users = usersSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
const owner =
  users.find((user) => user.email === 'akif@gmail.com') ??
  users.find((user) => user.role === 'owner' && user.status === 'active' && Array.isArray(user.modules) && user.modules.includes('vet')) ??
  users.find((user) => user.role === 'owner' && user.status === 'active') ??
  users[0];

if (!owner?.tenantId || !owner.uid) {
  throw new Error('Aktif tenant / kullanıcı bulunamadı');
}

const tenantId = owner.tenantId;
const userId = owner.uid;
const baseTime = Date.now();
const batch = db.batch();
const counts = {};
let offset = 0;

for (const [collection, items] of COLLECTIONS) {
  const col = db.collection(`tenants/${tenantId}/${collection}`);
  for (const { id, ...fields } of items) {
    const timestamp = new Date(baseTime - offset * 1000).toISOString();
    offset += 1;
    batch.set(col.doc(id), {
      id,
      createdAt: timestamp,
      updatedAt: timestamp,
      createdBy: userId,
      updatedBy: userId,
      deletedAt: null,
      ...fields,
    });
  }
  counts[collection] = items.length;
}

await batch.commit();

console.log(JSON.stringify({ tenantId, ownerEmail: owner.email ?? null, ...counts }, null, 2));
