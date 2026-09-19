import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const FIRST_NAMES = [
  'Ahmet', 'Mehmet', 'Ayşe', 'Fatma', 'Emine', 'Mustafa', 'Ali', 'Hüseyin', 'Hatice', 'Zeynep',
  'Elif', 'İbrahim', 'Hasan', 'Murat', 'Ömer', 'Yusuf', 'Merve', 'Elifnaz', 'Cem', 'Deniz',
  'Burak', 'Can', 'Ece', 'Selin', 'Berk', 'Eren', 'İrem', 'Derya', 'Gökhan', 'Serkan',
  'Pınar', 'Seda', 'Cansu', 'Onur', 'Barış', 'Kaan', 'Melis', 'Nazlı', 'Tolga', 'Umut',
  'Aslı', 'Büşra', 'Cemre', 'Dilan', 'Esra', 'Fatih', 'Gizem', 'Hakan', 'İpek', 'Kemal',
];

const LAST_NAMES = [
  'Yılmaz', 'Kaya', 'Demir', 'Çelik', 'Şahin', 'Yıldız', 'Yıldırım', 'Öztürk', 'Aydın', 'Özdemir',
  'Arslan', 'Doğan', 'Kılıç', 'Aslan', 'Çetin', 'Kara', 'Koç', 'Kurt', 'Özkan', 'Şimşek',
  'Polat', 'Korkmaz', 'Erdoğan', 'Güneş', 'Aksoy', 'Avcı', 'Tekin', 'Yalçın', 'Taş', 'Sarı',
  'Bulut', 'Acar', 'Bozkurt', 'Karaca', 'Çakır', 'Duman', 'Eren', 'Güler', 'Işık', 'Keskin',
];

const CITIES = [
  ['İstanbul', 'Kadıköy', 'Moda Caddesi'],
  ['İstanbul', 'Beşiktaş', 'Barbaros Bulvarı'],
  ['Ankara', 'Çankaya', 'Tunalı Hilmi Caddesi'],
  ['İzmir', 'Karşıyaka', 'Cemal Gürsel Caddesi'],
  ['Bursa', 'Nilüfer', 'FSM Bulvarı'],
  ['Antalya', 'Muratpaşa', 'Atatürk Caddesi'],
  ['Konya', 'Selçuklu', 'Ankara Yolu'],
  ['Adana', 'Seyhan', 'Ziyapaşa Bulvarı'],
  ['Gaziantep', 'Şahinbey', 'İncilipınar Caddesi'],
  ['Eskişehir', 'Tepebaşı', 'İsmet İnönü Caddesi'],
];

const PET_NAMES = [
  'Pamuk', 'Boncuk', 'Karabaş', 'Minnoş', 'Lokum', 'Duman', 'Tekir', 'Paşa', 'Prenses', 'Karamel',
  'Fıstık', 'Tarçın', 'Zeytin', 'Bulut', 'Simba', 'Luna', 'Max', 'Oscar', 'Mia', 'Leo',
  'Kuki', 'Şanslı', 'Maviş', 'Beyaz', 'Çıtır', 'Ponçik', 'Findık', 'Nar', 'Bal', 'Köpük',
];

const ANIMALS = [
  { type: 'Kedi', breeds: ['Tekir', 'Van Kedisi', 'British Shorthair', 'Siyam', 'Ankara Kedisi'] },
  { type: 'Köpek', breeds: ['Golden Retriever', 'Kangal', 'Pomeranian', 'Labrador', 'Terrier'] },
  { type: 'Kuş', breeds: ['Muhabbet Kuşu', 'Sultan Papağanı', 'Kanarya'] },
  { type: 'Tavşan', breeds: ['Hollanda Cüce', 'Aslan Başı'] },
];

const SEXES = ['male', 'female', 'unknown'];
const COLORS = ['Beyaz', 'Siyah', 'Gri', 'Sarı', 'Kahverengi', 'Alacalı', 'Turuncu'];

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

function turkishPhone(index) {
  const prefixes = ['532', '533', '535', '542', '543', '544', '505', '506', '555'];
  const prefix = pick(prefixes, index);
  const rest = String(1000000 + index).slice(-7);
  return `0${prefix}${rest}`;
}

function slug(value) {
  return value
    .toLocaleLowerCase('tr')
    .replaceAll('ç', 'c')
    .replaceAll('ğ', 'g')
    .replaceAll('ı', 'i')
    .replaceAll('ö', 'o')
    .replaceAll('ş', 's')
    .replaceAll('ü', 'u')
    .replace(/[^a-z0-9]+/g, '.');
}

function patientCount(index) {
  if (index % 5 === 0) {
    return 3;
  }
  if (index % 2 === 0) {
    return 2;
  }
  return 1;
}

function makePatient(index, customerIndex, slot) {
  const animal = pick(ANIMALS, index + slot);
  const year = 2016 + ((index + slot) % 9);
  const month = String(((index + slot) % 12) + 1).padStart(2, '0');
  const day = String(((index * 3 + slot) % 28) + 1).padStart(2, '0');
  return {
    name: pick(PET_NAMES, customerIndex * 3 + slot),
    animalType: animal.type,
    breed: pick(animal.breeds, index + slot),
    color: pick(COLORS, index + slot),
    sex: pick(SEXES, index + slot),
    sterilization: (index + slot) % 3 === 0,
    birthDate: `${year}-${month}-${day}T00:00:00.000Z`,
    chipNumber: (index + slot) % 4 === 0 ? `TR${String(100000000000 + index * 10 + slot)}` : null,
    notes: slot === 0 ? 'Düzenli kontrol' : null,
    active: true,
  };
}

loadEnv(resolve(import.meta.dirname, '..', '.env'));

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
if (!projectId || !clientEmail || !privateKey) {
  throw new Error('Firebase kimlik bilgileri eksik');
}

const app = getApps()[0] ?? initializeApp({
  projectId,
  credential: cert({ projectId, clientEmail, privateKey }),
});
const db = getFirestore(app);

const usersSnap = await db.collection('users').get();
const users = usersSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
const owner = users.find((user) => user.role === 'owner' && user.status === 'active' && Array.isArray(user.modules) && user.modules.includes('vet'))
  ?? users.find((user) => user.role === 'owner' && user.status === 'active')
  ?? users[0];

if (!owner?.tenantId || !owner.uid) {
  throw new Error('Aktif tenant / kullanıcı bulunamadı');
}

const tenantId = owner.tenantId;
const userId = owner.uid;
const now = new Date().toISOString();
const customersCol = db.collection(`tenants/${tenantId}/customers`);
const patientsCol = db.collection(`tenants/${tenantId}/patients`);

let createdCustomers = 0;
let createdPatients = 0;

for (let batchStart = 0; batchStart < 200; batchStart += 50) {
  const batch = db.batch();
  const end = Math.min(batchStart + 50, 200);
  for (let i = batchStart; i < end; i += 1) {
    const firstName = pick(FIRST_NAMES, i);
    const lastName = pick(LAST_NAMES, i * 3 + 1);
    const [city, district, street] = pick(CITIES, i);
    const customerRef = customersCol.doc();
    batch.set(customerRef, {
      id: customerRef.id,
      createdAt: now,
      updatedAt: now,
      createdBy: userId,
      updatedBy: userId,
      deletedAt: null,
      firstName,
      lastName,
      phone: turkishPhone(i),
      email: `${slug(firstName)}.${slug(lastName)}.${i + 1}@ornek.odivon`,
      address: `${street} No:${(i % 80) + 1} ${district}/${city}`,
      note: i % 7 === 0 ? 'Düzenli gelen müşteri' : null,
      discountRate: i % 10 === 0 ? 10 : 0,
      isArchive: false,
    });
    createdCustomers += 1;

    const count = patientCount(i);
    for (let slot = 0; slot < count; slot += 1) {
      const patientRef = patientsCol.doc();
      const data = makePatient(i, i, slot);
      batch.set(patientRef, {
        id: patientRef.id,
        createdAt: now,
        updatedAt: now,
        createdBy: userId,
        updatedBy: userId,
        deletedAt: null,
        customerId: customerRef.id,
        name: data.name,
        birthDate: data.birthDate,
        chipNumber: data.chipNumber,
        sex: data.sex,
        animalType: data.animalType,
        breed: data.breed,
        color: data.color,
        sterilization: data.sterilization,
        notes: data.notes,
        active: data.active,
      });
      createdPatients += 1;
    }
  }
  await batch.commit();
}

console.log(JSON.stringify({
  tenantId,
  ownerEmail: owner.email ?? null,
  customers: createdCustomers,
  patients: createdPatients,
}, null, 2));
