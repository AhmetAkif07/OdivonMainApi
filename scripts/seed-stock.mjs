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
const now = Date.now();
const stamp = (index) => new Date(now - index * 1000).toISOString();
const daysAgo = (days) => new Date(now - days * 24 * 60 * 60 * 1000).toISOString();

const productsSnap = await db.collection(`tenants/${tenantId}/products`).get();
const products = new Map(
  productsSnap.docs.map((doc) => [doc.id, doc.data()]).filter(([, item]) => !item.deletedAt),
);

const docs = [];
let offset = 0;
const add = (item) => {
  docs.push({
    ...item,
    createdAt: stamp(offset),
    updatedAt: stamp(offset),
    createdBy: userId,
    updatedBy: userId,
    deletedAt: null,
  });
  offset += 1;
};

const opening = [
  ['seed-prd-karma', 20, 180],
  ['seed-prd-kuduz', 15, 120],
  ['seed-prd-kedi-karma', 10, 160],
  ['seed-prd-mama-kopek', 12, 1450],
  ['seed-prd-mama-kedi', 18, 520],
];
opening.forEach(([productId, quantity, unitPrice], index) => {
  const product = products.get(productId);
  if (!product?.storeId) {
    return;
  }
  add({
    id: `seed-stmv-open-${productId}`,
    date: daysAgo(20),
    productId,
    storeId: product.storeId,
    direction: 'in',
    reason: 'adjustment',
    quantity,
    unitPrice,
    remark: 'Açılış stoğu',
    source: { type: 'manual', id: `seed-stmv-open-${productId}` },
  });
});

const salesSnap = await db.collection(`tenants/${tenantId}/sales`).get();
for (const doc of salesSnap.docs) {
  const sale = doc.data();
  if (sale.deletedAt) {
    continue;
  }
  const purchase = sale.type === 'purchase';
  (sale.lines ?? []).forEach((line, index) => {
    const product = products.get(line.productId);
    if (!product || product.productType === 'service' || !product.storeId) {
      return;
    }
    add({
      id: `seed-stmv-${sale.type}-${sale.id}-${index}`,
      date: sale.date,
      productId: line.productId,
      storeId: product.storeId,
      direction: purchase ? 'in' : 'out',
      reason: purchase ? 'purchase' : 'sale',
      quantity: line.quantity,
      unitPrice: line.unitPrice ?? null,
      remark: sale.invoiceNo ?? null,
      source: { type: purchase ? 'purchase' : 'sale', id: sale.id },
    });
  });
}

const vaccinesSnap = await db.collection(`tenants/${tenantId}/vaccines`).get();
const vaccines = new Map(vaccinesSnap.docs.map((doc) => [doc.id, doc.data()]));
const schedulesSnap = await db.collection(`tenants/${tenantId}/vaccineSchedules`).get();
for (const doc of schedulesSnap.docs) {
  const schedule = doc.data();
  if (schedule.deletedAt || !schedule.done) {
    continue;
  }
  const vaccine = vaccines.get(schedule.vaccineId);
  (vaccine?.medicines ?? []).forEach((medicine, index) => {
    const product = products.get(medicine.productId);
    if (!product?.storeId) {
      return;
    }
    add({
      id: `seed-stmv-vac-${schedule.id}-${index}`,
      date: schedule.doneAt ?? schedule.dueAt,
      productId: medicine.productId,
      storeId: product.storeId,
      direction: 'out',
      reason: 'vaccine',
      quantity: medicine.quantity,
      unitPrice: medicine.salesAmount ?? null,
      remark: vaccine.name,
      source: { type: 'vaccine', id: schedule.id },
    });
  });
}

const demandCol = db.collection(`tenants/${tenantId}/demands`);
const demandSnap = await demandCol.get();
for (const doc of demandSnap.docs) {
  const demand = doc.data();
  if (demand.id === 'seed-dem-1' && demand.status !== 'completed') {
    await doc.ref.set({ ...demand, status: 'completed' }, { merge: true });
    demand.status = 'completed';
  }
  if (demand.deletedAt || demand.status !== 'completed') {
    continue;
  }
  (demand.lines ?? []).forEach((line, index) => {
    const product = products.get(line.productId);
    if (!product?.storeId) {
      return;
    }
    add({
      id: `seed-stmv-dem-${demand.id}-${index}`,
      date: demand.date,
      productId: line.productId,
      storeId: product.storeId,
      direction: 'in',
      reason: 'demand',
      quantity: line.quantity,
      unitPrice: line.unitPrice ?? null,
      remark: demand.documentNo ?? null,
      source: { type: 'demand', id: demand.id },
    });
  });
}

const batch = db.batch();
for (const item of docs) {
  batch.set(db.doc(`tenants/${tenantId}/stockMovements/${item.id}`), item);
}
await batch.commit();

console.log(
  JSON.stringify(
    {
      tenantId,
      ownerEmail: owner.email ?? null,
      stockMovements: docs.length,
    },
    null,
    2,
  ),
);
