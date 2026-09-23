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
const hoursFromNow = (hours) => new Date(now + hours * 60 * 60 * 1000).toISOString();

const patientsSnap = await db.collection(`tenants/${tenantId}/patients`).get();
const patients = patientsSnap.docs
  .map((doc) => ({ id: doc.id, ...doc.data() }))
  .filter((item) => !item.deletedAt);
if (patients.length === 0) {
  throw new Error('Lab örnekleri için en az bir hasta gerekli');
}

const docs = [];
let offset = 0;
const add = (collection, item) => {
  docs.push({
    collection,
    ...item,
    createdAt: stamp(offset),
    updatedAt: stamp(offset),
    createdBy: userId,
    updatedBy: userId,
    deletedAt: null,
  });
  offset += 1;
};

add('agenda', {
  id: 'seed-agenda-arama',
  title: 'Kontrol araması',
  type: 'call',
  priority: 'high',
  dueAt: hoursFromNow(6),
  notes: 'Ameliyat sonrası ev sahibiyle görüş',
  done: false,
});
add('agenda', {
  id: 'seed-agenda-ziyaret',
  title: 'Çiftlik ziyareti',
  type: 'visit',
  priority: 'normal',
  dueAt: hoursFromNow(30),
  notes: 'Aşı takvimi kontrolü',
  done: false,
});
add('agenda', {
  id: 'seed-agenda-gorev',
  title: 'Lab sonuçlarını tara',
  type: 'task',
  priority: 'low',
  dueAt: hoursFromNow(-20),
  notes: null,
  done: true,
});

const first = patients[0];
const second = patients[Math.min(1, patients.length - 1)];
add('labDocuments', {
  id: 'seed-lab-kan',
  customerId: first.customerId,
  customerName: first.customerName ?? '',
  patientId: first.id,
  patientName: first.name ?? '',
  fileName: 'Kan tahlili.pdf',
  url: 'https://example.com/lab/kan-tahlili.pdf',
  remark: 'Rutin kontrol',
  read: false,
});
add('labDocuments', {
  id: 'seed-lab-rontgen',
  customerId: second.customerId,
  customerName: second.customerName ?? '',
  patientId: second.id,
  patientName: second.name ?? '',
  fileName: 'Röntgen.jpg',
  url: 'https://example.com/lab/rontgen.jpg',
  remark: null,
  read: true,
});

add('files', {
  id: 'seed-file-folder-lab',
  kind: 'folder',
  parentId: null,
  name: 'Laboratuvar',
  description: 'Lab çıktıları',
  url: null,
});
add('files', {
  id: 'seed-file-onam',
  kind: 'file',
  parentId: null,
  name: 'Anestezi onamı',
  description: 'Örnek form',
  url: 'https://example.com/files/anestezi-onam.pdf',
});
add('files', {
  id: 'seed-file-lab-protokol',
  kind: 'file',
  parentId: 'seed-file-folder-lab',
  name: 'Lab protokolü',
  description: null,
  url: 'https://example.com/files/lab-protokol.pdf',
});

const batch = db.batch();
for (const item of docs) {
  const { collection, ...data } = item;
  batch.set(db.doc(`tenants/${tenantId}/${collection}/${data.id}`), data);
}
batch.set(db.doc(`tenants/${tenantId}/clinicParameters/current`), {
  id: 'current',
  appointmentStart: '09:00',
  appointmentEnd: '19:00',
  appointmentInterval: 15,
  sessionDuration: 20,
  appointmentReminderHours: 24,
  agendaReminderHours: 2,
  displayVetNo: false,
  autoSms: false,
  animalBreedsRequired: false,
  firstInspectionRequired: true,
  examinationAmountZero: false,
  cashRegisterId: 'seed-cash-merkez',
  cardCashRegisterId: 'seed-cash-pos',
  transferCashRegisterId: 'seed-cash-banka',
  createdAt: stamp(offset),
  updatedAt: stamp(offset),
  createdBy: userId,
  updatedBy: userId,
  deletedAt: null,
});
await batch.commit();

console.log(
  JSON.stringify(
    {
      tenantId,
      ownerEmail: owner.email ?? null,
      agenda: 3,
      labDocuments: 2,
      files: 3,
      clinicParameters: 1,
    },
    null,
    2,
  ),
);
