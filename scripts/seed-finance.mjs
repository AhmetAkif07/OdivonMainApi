import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

function loadEnv(path) {
  const text = readFileSync(path, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const index = trimmed.indexOf('=');
    if (index < 0) {
      continue;
    }
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function roundMoney(value) {
  return Math.round(value * 100) / 100;
}

function priceLine(line) {
  const gross = Math.max(0, line.quantity * line.unitPrice - (line.discount ?? 0));
  const ratio = (line.taxRatio ?? 0) / 100;
  if (line.vatIncluded !== false && ratio > 0) {
    const net = gross / (1 + ratio);
    return { net: roundMoney(net), vat: roundMoney(gross - net), total: roundMoney(gross) };
  }
  const vat = gross * ratio;
  return { net: roundMoney(gross), vat: roundMoney(vat), total: roundMoney(gross + vat) };
}

function priceDocument(lines, discount = 0) {
  const summed = lines.reduce(
    (acc, line) => {
      const priced = priceLine(line);
      return { net: acc.net + priced.net, vat: acc.vat + priced.vat, total: acc.total + priced.total };
    },
    { net: 0, vat: 0, total: 0 },
  );
  return {
    net: roundMoney(summed.net),
    vat: roundMoney(summed.vat),
    total: roundMoney(Math.max(0, summed.total - discount)),
  };
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
  users.find((user) => user.role === 'owner' && user.status === 'active');
if (!owner?.tenantId || !owner.uid) {
  throw new Error('Aktif tenant / kullanıcı bulunamadı');
}

const tenantId = owner.tenantId;
const userId = owner.uid;
const customersSnap = await db.collection(`tenants/${tenantId}/customers`).get();
const customers = customersSnap.docs
  .map((doc) => doc.data())
  .filter((item) => !item.deletedAt && item.id)
  .slice(0, 2);
if (customers.length === 0) {
  throw new Error('Satış örnekleri için en az bir müşteri gerekli');
}

const now = Date.now();
const daysAgo = (days) => new Date(now - days * 24 * 60 * 60 * 1000).toISOString();
const stamp = (index) => new Date(now - index * 1000).toISOString();

const line = (fields) => ({ discount: 0, vatIncluded: true, ...fields });

const sales = [
  {
    id: 'seed-sale-1',
    type: 'sale',
    date: daysAgo(1),
    customerId: customers[0].id,
    supplierId: null,
    invoiceNo: 'STS-1001',
    paymentMethodId: 'seed-pay-kart',
    cashRegisterId: 'seed-cash-pos',
    discount: 0,
    remark: 'Muayene ve aşı',
    lines: [
      line({ productId: 'seed-srv-muayene', quantity: 1, unitPrice: 500, taxId: 'seed-tax-20', taxRatio: 20 }),
      line({ productId: 'seed-prd-kuduz', quantity: 1, unitPrice: 350, taxId: 'seed-tax-10', taxRatio: 10 }),
    ],
  },
  {
    id: 'seed-sale-2',
    type: 'sale',
    date: daysAgo(3),
    customerId: customers[Math.min(1, customers.length - 1)].id,
    supplierId: null,
    invoiceNo: 'STS-1002',
    paymentMethodId: 'seed-pay-nakit',
    cashRegisterId: 'seed-cash-merkez',
    discount: 50,
    remark: 'Mama satışı',
    lines: [
      line({ productId: 'seed-prd-mama-kopek', quantity: 1, unitPrice: 1950, taxId: 'seed-tax-1', taxRatio: 1 }),
    ],
  },
  {
    id: 'seed-buy-1',
    type: 'purchase',
    date: daysAgo(5),
    customerId: null,
    supplierId: 'seed-sup-vetmed',
    invoiceNo: 'ALS-2001',
    paymentMethodId: 'seed-pay-havale',
    cashRegisterId: 'seed-cash-banka',
    discount: 0,
    remark: 'Aşı alımı',
    lines: [
      line({ productId: 'seed-prd-karma', quantity: 10, unitPrice: 180, taxId: 'seed-tax-10', taxRatio: 10 }),
    ],
  },
  {
    id: 'seed-buy-2',
    type: 'purchase',
    date: daysAgo(8),
    customerId: null,
    supplierId: 'seed-sup-petfood',
    invoiceNo: 'ALS-2002',
    paymentMethodId: 'seed-pay-veresiye',
    cashRegisterId: null,
    discount: 0,
    remark: 'Mama alımı',
    lines: [
      line({ productId: 'seed-prd-mama-kedi', quantity: 6, unitPrice: 520, taxId: 'seed-tax-1', taxRatio: 1 }),
    ],
  },
].map((item, index) => ({
  ...item,
  ...priceDocument(item.lines, item.discount),
  createdAt: stamp(index),
  updatedAt: stamp(index),
  createdBy: userId,
  updatedBy: userId,
  deletedAt: null,
}));

const collections = [
  {
    id: 'seed-col-1',
    kind: 'collection',
    date: daysAgo(1),
    customerId: customers[0].id,
    supplierId: null,
    amount: 850,
    paymentMethodId: 'seed-pay-kart',
    cashRegisterId: 'seed-cash-pos',
    saleId: 'seed-sale-1',
    remark: 'STS-1001 tahsilatı',
  },
  {
    id: 'seed-col-2',
    kind: 'collection',
    date: daysAgo(2),
    customerId: customers[Math.min(1, customers.length - 1)].id,
    supplierId: null,
    amount: 400,
    paymentMethodId: 'seed-pay-nakit',
    cashRegisterId: 'seed-cash-merkez',
    saleId: null,
    remark: 'Avans tahsilat',
  },
  {
    id: 'seed-pay-1',
    kind: 'payment',
    date: daysAgo(5),
    customerId: null,
    supplierId: 'seed-sup-vetmed',
    amount: 1980,
    paymentMethodId: 'seed-pay-havale',
    cashRegisterId: 'seed-cash-banka',
    saleId: 'seed-buy-1',
    remark: 'ALS-2001 ödemesi',
  },
].map((item, index) => ({
  ...item,
  createdAt: stamp(20 + index),
  updatedAt: stamp(20 + index),
  createdBy: userId,
  updatedBy: userId,
  deletedAt: null,
}));

const movements = [
  {
    id: 'seed-cashmv-1',
    cashRegisterId: 'seed-cash-merkez',
    date: daysAgo(0),
    direction: 'in',
    amount: 1500,
    remark: 'Gün başı kasa devri',
  },
  {
    id: 'seed-cashmv-2',
    cashRegisterId: 'seed-cash-merkez',
    date: daysAgo(1),
    direction: 'out',
    amount: 250,
    remark: 'Kırtasiye gideri',
  },
  {
    id: 'seed-cashmv-3',
    cashRegisterId: 'seed-cash-pos',
    date: daysAgo(2),
    direction: 'in',
    amount: 850,
    remark: 'POS gün sonu',
  },
].map((item, index) => ({
  ...item,
  createdAt: stamp(40 + index),
  updatedAt: stamp(40 + index),
  createdBy: userId,
  updatedBy: userId,
  deletedAt: null,
}));

const batch = db.batch();
for (const item of sales) {
  batch.set(db.doc(`tenants/${tenantId}/sales/${item.id}`), item);
}
for (const item of collections) {
  batch.set(db.doc(`tenants/${tenantId}/collections/${item.id}`), item);
}
for (const item of movements) {
  batch.set(db.doc(`tenants/${tenantId}/cashMovements/${item.id}`), item);
}
await batch.commit();

console.log(
  JSON.stringify(
    {
      tenantId,
      ownerEmail: owner.email ?? null,
      sales: sales.filter((item) => item.type === 'sale').length,
      purchases: sales.filter((item) => item.type === 'purchase').length,
      collections: collections.filter((item) => item.kind === 'collection').length,
      payments: collections.filter((item) => item.kind === 'payment').length,
      cashMovements: movements.length,
    },
    null,
    2,
  ),
);
