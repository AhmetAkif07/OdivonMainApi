import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const COUNT = 200;
const DURATION_MIN = 20;
const SLOT_MS = 60_000;

const TYPES = ['checkup', 'vaccination', 'control', 'surgery', 'dental', 'emergency'];
const APPOINTMENT_STATUSES = ['scheduled', 'completed', 'cancelled', 'no_show'];
const EXAM_STATUSES = ['draft', 'completed'];
const COMPLAINTS = [
  'İştahsızlık',
  'Kusma',
  'İshal',
  'Topallama',
  'Kaşıntı',
  'Öksürük',
  'Kulak akıntısı',
  'Aşı kontrolü',
  'Kontrol muayenesi',
  'Diş taşı',
];
const TREATMENTS = [
  'Serum ve takip',
  'Antibiyotik başlandı',
  'Aşı uygulandı',
  'Kulak temizliği',
  'Tırnak kesimi',
  'Diyet önerildi',
  'Ağrı kesici verildi',
  'Kontrole çağrıldı',
];
const SYMPTOMS = ['halsizlik', 'ateş', 'kaşıntı', 'öksürük', 'kusma', 'ishal', 'topallama'];
const NOTES = [
  'Sahibi düzenli geliyor',
  'Sabah randevusu tercih edildi',
  'Kontrol sonrası aranacak',
  'Aşı hatırlatması yapıldı',
  null,
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

function pick(list, index) {
  return list[index % list.length];
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function turkeyDate(year, month, day, hour, minute) {
  return new Date(`${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00.000+03:00`);
}

function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function isWeekendTurkey(date) {
  const weekday = new Date(date.getTime() + 3 * 60 * 60 * 1000).getUTCDay();
  return weekday === 0 || weekday === 6;
}

function clinicSlots(count, durationMin) {
  const slots = [];
  let cursor = turkeyDate(2026, 8, 3, 9, 0);
  while (slots.length < count) {
    if (isWeekendTurkey(cursor)) {
      cursor = addDays(cursor, 1);
      continue;
    }
    const turkeyHour = new Date(cursor.getTime() + 3 * 60 * 60 * 1000).getUTCHours();
    if (turkeyHour >= 17) {
      const turkey = new Date(cursor.getTime() + 3 * 60 * 60 * 1000);
      turkey.setUTCDate(turkey.getUTCDate() + 1);
      cursor = turkeyDate(turkey.getUTCFullYear(), turkey.getUTCMonth() + 1, turkey.getUTCDate(), 9, 0);
      continue;
    }
    const begin = new Date(cursor);
    const end = new Date(cursor.getTime() + durationMin * SLOT_MS);
    slots.push({ begin, end });
    cursor = end;
  }
  return slots;
}

function reservationSlotIds(doctorId, beginAt, endAt) {
  const beginMinute = Math.floor(beginAt.getTime() / SLOT_MS);
  const ids = [];
  for (let minute = beginMinute; minute * SLOT_MS < endAt.getTime(); minute += 1) {
    ids.push(`${doctorId}_${minute}`);
  }
  return ids;
}

function appointmentStatus(index) {
  if (index % 10 === 0) {
    return 'cancelled';
  }
  if (index % 10 === 1) {
    return 'no_show';
  }
  if (index % 5 === 0) {
    return 'completed';
  }
  return 'scheduled';
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
const doctorId = owner.uid;
const patientsSnap = await db.collection(`tenants/${tenantId}/patients`).get();
const patients = patientsSnap.docs
  .map((doc) => doc.data())
  .filter((patient) => !patient.deletedAt && patient.customerId && patient.id);

if (patients.length === 0) {
  throw new Error('Bu tenantta hasta yok; önce müşteri/hasta seed çalıştırın');
}

const appointmentsCol = db.collection(`tenants/${tenantId}/appointments`);
const reservationsCol = db.collection(`tenants/${tenantId}/appointmentReservations`);
const examinationsCol = db.collection(`tenants/${tenantId}/examinations`);
const slots = clinicSlots(COUNT, DURATION_MIN);

let createdAppointments = 0;
let createdReservations = 0;
let createdExaminations = 0;

const writesPerAppointment = DURATION_MIN + 1;
const appointmentBatchSize = Math.max(1, Math.floor(450 / writesPerAppointment));

for (let batchStart = 0; batchStart < COUNT; batchStart += appointmentBatchSize) {
  const batch = db.batch();
  const end = Math.min(batchStart + appointmentBatchSize, COUNT);
  for (let i = batchStart; i < end; i += 1) {
    const patient = pick(patients, i * 3 + 1);
    const { begin, end: finish } = slots[i];
    const status = appointmentStatus(i);
    const appointmentRef = appointmentsCol.doc();
    const slotIds = status === 'cancelled' ? [] : reservationSlotIds(doctorId, begin, finish);
    const createdAt = begin.toISOString();
    batch.set(appointmentRef, {
      id: appointmentRef.id,
      createdAt,
      updatedAt: createdAt,
      createdBy: userId,
      updatedBy: userId,
      deletedAt: null,
      beginAt: begin.toISOString(),
      endAt: finish.toISOString(),
      customerId: patient.customerId,
      patientId: patient.id,
      doctorId,
      type: pick(TYPES, i),
      note: pick(NOTES, i),
      status,
      reservationSlotIds: slotIds,
    });
    createdAppointments += 1;
    for (const slotId of slotIds) {
      batch.set(reservationsCol.doc(slotId), {
        appointmentId: appointmentRef.id,
        doctorId,
        slotId,
      });
      createdReservations += 1;
    }
  }
  await batch.commit();
}

for (let batchStart = 0; batchStart < COUNT; batchStart += 50) {
  const batch = db.batch();
  const end = Math.min(batchStart + 50, COUNT);
  for (let i = batchStart; i < end; i += 1) {
    const patient = pick(patients, i * 5 + 2);
    const date = addDays(turkeyDate(2026, 8, 4, 10, 0), i);
    const iso = date.toISOString();
    const examinationRef = examinationsCol.doc();
    batch.set(examinationRef, {
      id: examinationRef.id,
      createdAt: iso,
      updatedAt: iso,
      createdBy: userId,
      updatedBy: userId,
      deletedAt: null,
      date: iso,
      customerId: patient.customerId,
      patientId: patient.id,
      vitals: {
        temp: 38 + ((i % 7) * 0.1),
        pulse: 80 + (i % 40),
        respiratoryRate: 18 + (i % 10),
        weight: 3 + (i % 25),
      },
      symptoms: [pick(SYMPTOMS, i), pick(SYMPTOMS, i + 3)].filter((item, index, list) => list.indexOf(item) === index),
      complaint: pick(COMPLAINTS, i),
      treatment: i % 4 === 0 ? null : pick(TREATMENTS, i),
      status: pick(EXAM_STATUSES, i),
    });
    createdExaminations += 1;
  }
  await batch.commit();
}

console.log(
  JSON.stringify(
    {
      tenantId,
      ownerEmail: owner.email ?? null,
      doctorId,
      appointments: createdAppointments,
      reservations: createdReservations,
      examinations: createdExaminations,
    },
    null,
    2,
  ),
);
