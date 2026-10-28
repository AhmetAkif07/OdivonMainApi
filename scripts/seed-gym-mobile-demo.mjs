// Fills one gym member with demo data for the mobile app (plans, sessions, measurements, visits).
// Usage: node scripts/seed-gym-mobile-demo.mjs --tenant <tenantId> --email <member email> [--clean] [--dry-run]
// Every document carries `seed: "mobile-demo"`; --clean removes only those, and a normal run
// cleans first, so it can be repeated safely.
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const SEED = 'mobile-demo';
const COLLECTIONS = ['gymWorkoutPlans', 'gymWorkoutSessions', 'gymMeasurements', 'gymAccessLogs'];
const DAY_MS = 86_400_000;

function loadEnv(path) {
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index < 0) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const tenantId = arg('tenant');
const email = arg('email')?.trim().toLowerCase();
const cleanOnly = process.argv.includes('--clean');
const dryRun = process.argv.includes('--dry-run');
if (!tenantId || !email) {
  throw new Error('Kullanım: node scripts/seed-gym-mobile-demo.mjs --tenant <tenantId> --email <e-posta> [--clean] [--dry-run]');
}

loadEnv(resolve(import.meta.dirname, '..', '.env'));
const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
if (!projectId || !clientEmail || !privateKey) throw new Error('Firebase kimlik bilgileri eksik');

const app = getApps()[0] ?? initializeApp({ projectId, credential: cert({ projectId, clientEmail, privateKey }) });
const db = getFirestore(app);
const tenantRef = db.collection('tenants').doc(tenantId);

const tenant = await tenantRef.get();
if (!tenant.exists) throw new Error(`Tenant bulunamadı: ${tenantId}`);
const memberDoc = (await tenantRef.collection('gymMembers').get()).docs.find(
  (doc) => String(doc.data().email ?? '').trim().toLowerCase() === email && !doc.data().deletedAt,
);
if (!memberDoc) {
  const users = (await db.collection('users').where('email', '==', email).get()).docs.map((doc) => doc.data());
  const count = (await tenantRef.collection('gymMembers').count().get()).data().count;
  console.log(`gymMembers sayısı: ${count}`);
  if (count <= 5) {
    const docs = (await tenantRef.collection('gymMembers').get()).docs;
    console.log('Üyeler:', docs.map((doc) => `${doc.data().displayName ?? '-'} <${doc.data().email ?? '-'}>`));
  }
  console.log('users kaydı:', users.map((user) => ({ uid: user.uid, role: user.role, tenantId: user.tenantId, status: user.status })));
  throw new Error(`${tenantId} içinde ${email} e-postalı üye yok`);
}
const member = memberDoc.data();
const uid = memberDoc.id;
console.log(`Proje: ${projectId} | Tenant: ${tenantId} (${tenant.data().name ?? '-'}) | Üye: ${member.displayName ?? '-'} (${uid})`);

async function clean() {
  let removed = 0;
  for (const name of COLLECTIONS) {
    const snapshot = await tenantRef.collection(name).where('seed', '==', SEED).get();
    const mine = snapshot.docs.filter((doc) => doc.data().userId === uid);
    if (!dryRun) {
      for (let i = 0; i < mine.length; i += 400) {
        const batch = db.batch();
        mine.slice(i, i + 400).forEach((doc) => batch.delete(doc.ref));
        await batch.commit();
      }
    }
    removed += mine.length;
  }
  return removed;
}

const removed = await clean();
console.log(`${dryRun ? '[dry-run] silinecek' : 'Silinen'} eski demo kaydı: ${removed}`);
if (cleanOnly) process.exit(0);

const now = Date.now();
const iso = (ms) => new Date(ms).toISOString();
const base = (id, at) => ({ id, createdAt: at, updatedAt: at, createdBy: uid, updatedBy: uid, deletedAt: null, seed: SEED });

const EQUIPMENT = { barbell: 'Barbell', dumbbell: 'Dumbbell', machine: 'Makine', cable: 'Kablo', bodyweight: 'Vücut Ağırlığı', ezbar: 'Z-Bar' };
// [slug, name, muscleGroup, equipment, sets, reps, startKg, stepKg, restSeconds]
const ex = (slug, name, muscleGroup, equipment, sets, reps, kg, step, rest = 90) => ({
  slug, name, muscleGroup, equipment, sets, reps, kg, step, rest,
});

const TRAINER_DAYS = [
  {
    name: 'İtiş',
    focus: 'Göğüs · Omuz · Arka kol',
    items: [
      ex('bench-press', 'Bench Press', 'chest', 'barbell', 4, 8, 60, 2.5, 120),
      ex('incline-dumbbell-press', 'Incline Dumbbell Press', 'chest', 'dumbbell', 3, 10, 22, 2),
      ex('overhead-press', 'Overhead Press', 'shoulders', 'barbell', 3, 8, 35, 2.5, 120),
      ex('lateral-raise', 'Lateral Raise', 'shoulders', 'dumbbell', 3, 12, 8, 1, 60),
      ex('triceps-pushdown', 'Triceps Pushdown', 'arms', 'cable', 3, 12, 25, 2.5, 60),
    ],
  },
  {
    name: 'Çekiş',
    focus: 'Sırt · Ön kol',
    items: [
      ex('deadlift', 'Deadlift', 'back', 'barbell', 3, 5, 90, 5, 150),
      ex('lat-pulldown', 'Lat Pulldown', 'back', 'cable', 4, 10, 50, 2.5),
      ex('seated-cable-row', 'Seated Cable Row', 'back', 'cable', 3, 10, 45, 2.5),
      ex('face-pull', 'Face Pull', 'shoulders', 'cable', 3, 15, 15, 1, 60),
      ex('barbell-curl', 'Barbell Curl', 'arms', 'barbell', 3, 10, 25, 2.5, 60),
    ],
  },
  {
    name: 'Bacak',
    focus: 'Ön bacak · Arka bacak',
    items: [
      ex('back-squat', 'Squat', 'legs', 'barbell', 4, 6, 70, 5, 150),
      ex('romanian-deadlift', 'Romanian Deadlift', 'legs', 'barbell', 3, 8, 60, 5, 120),
      ex('leg-press', 'Leg Press', 'legs', 'machine', 3, 12, 120, 10),
      ex('lying-leg-curl', 'Lying Leg Curl', 'legs', 'machine', 3, 12, 30, 2.5, 60),
      ex('leg-press-calf-raise', 'Leg Press Calf Raise', 'legs', 'machine', 4, 15, 80, 5, 45),
    ],
  },
];

const OWN_DAYS = [
  {
    name: 'Üst Vücut',
    items: [
      ex('dumbbell-bench-press', 'Dumbbell Bench Press', 'chest', 'dumbbell', 3, 10, 24, 2),
      ex('dumbbell-row', 'Tek Kol Dumbbell Row', 'back', 'dumbbell', 3, 10, 26, 2),
      ex('hammer-curl', 'Hammer Curl', 'arms', 'dumbbell', 3, 12, 12, 1, 60),
    ],
  },
  {
    name: 'Alt Vücut',
    items: [
      ex('goblet-squat', 'Goblet Squat', 'legs', 'dumbbell', 3, 12, 24, 2),
      ex('bulgarian-split-squat', 'Bulgarian Split Squat', 'legs', 'dumbbell', 3, 10, 14, 2),
      ex('push-up', 'Şınav', 'chest', 'bodyweight', 3, 15, 0, 0, 60),
    ],
  },
];

function planDays(days, planKey) {
  return days.map((day, index) => ({
    id: `${planKey}-day-${index + 1}`,
    name: day.name,
    order: index + 1,
    ...(day.focus ? { focus: day.focus } : {}),
    exercises: day.items.map((item, position) => ({
      id: `${planKey}-ex-${index + 1}-${position + 1}`,
      exerciseId: `sys-ex-${item.slug}`,
      name: item.name,
      muscleGroup: item.muscleGroup,
      equipmentName: EQUIPMENT[item.equipment],
      sets: item.sets,
      reps: item.reps,
      weight: item.kg,
      restSeconds: item.rest,
      notes: '',
    })),
  }));
}

function legacyExercises(days) {
  return days.flatMap((day) => day.exercises.map((item) => ({ ...item, dayName: `${day.order}. Gün: ${day.name}` })));
}

function plan({ title, description, days, trainer, startMs }) {
  const id = randomUUID();
  const at = iso(startMs);
  return {
    ...base(id, at),
    tenantId,
    userId: uid,
    templateId: null,
    disciplineId: null,
    trainerId: trainer ? (member.trainerId ?? null) : null,
    trainerName: trainer ? (member.trainerName ?? 'Demo Antrenör') : null,
    createdByMember: !trainer,
    title,
    description,
    notes: trainer ? 'Her hafta ana hareketlerde ağırlığı küçük adımlarla artır.' : '',
    days,
    exercises: legacyExercises(days),
    status: 'active',
    startDate: at,
    endDate: null,
  };
}

const trainerDays = planDays(TRAINER_DAYS, 'ppl');
const ownDays = planDays(OWN_DAYS, 'own');
const trainerPlan = plan({
  title: 'İtiş / Çekiş / Bacak',
  description: 'Haftada 3 gün, kuvvet ve hacim odaklı program.',
  days: trainerDays,
  trainer: true,
  startMs: now - 28 * DAY_MS,
});
const ownPlan = plan({
  title: 'Evde / Dumbbell Günü',
  description: 'Salona gidemediğim günler için.',
  days: ownDays,
  trainer: false,
  startMs: now - 12 * DAY_MS,
});

// Measurements first: session calories use the latest weight.
const measurements = [
  [26, 82.6, 21.4, 96, 38.0],
  [20, 82.0, 21.0, 95, 38.4],
  [14, 81.5, 20.5, 94, 38.6],
  [8, 81.1, 20.1, 93, 38.9],
  [2, 80.6, 19.7, 92, 39.1],
].map(([daysAgo, weight, bodyFatPercentage, waist, muscleMassKg]) => {
  const at = iso(now - daysAgo * DAY_MS);
  const id = randomUUID();
  return {
    ...base(id, at),
    tenantId,
    userId: uid,
    date: at,
    weight,
    height: member.heightCm ?? 178,
    waist,
    chest: 104,
    bicep: 36.5,
    bodyFatPercentage,
    muscleMassKg,
  };
});
const weightAt = (ms) => [...measurements].reverse().find((item) => new Date(item.date).getTime() <= ms)?.weight ?? 70;

// Sessions: about three a week over the last three weeks, cycling the trainer plan's days;
// one own-plan session in between. Ends yesterday so "today" is the next day in the cycle.
const SCHEDULE = [
  { daysAgo: 20, plan: 'trainer' },
  { daysAgo: 18, plan: 'trainer' },
  { daysAgo: 16, plan: 'trainer' },
  { daysAgo: 13, plan: 'trainer' },
  { daysAgo: 11, plan: 'own' },
  { daysAgo: 10, plan: 'trainer' },
  { daysAgo: 8, plan: 'trainer' },
  { daysAgo: 6, plan: 'trainer' },
  { daysAgo: 3, plan: 'trainer' },
  { daysAgo: 1, plan: 'trainer' },
];

const bestKg = {};
const lastVolume = {};
const counters = { trainer: 0, own: 0 };
const sessions = SCHEDULE.map(({ daysAgo, plan: which }, sessionIndex) => {
  const source = which === 'trainer' ? trainerPlan : ownPlan;
  const templateDays = which === 'trainer' ? TRAINER_DAYS : OWN_DAYS;
  const cycle = counters[which]++;
  const dayIndex = cycle % source.days.length;
  const round = Math.floor(cycle / source.days.length);
  const day = source.days[dayIndex];

  const startDay = new Date(now - daysAgo * DAY_MS);
  startDay.setUTCHours(15 + (sessionIndex % 3), 10 + ((sessionIndex * 7) % 40), 0, 0); // 18:10–20:50 Istanbul
  const startedMs = startDay.getTime();
  let clock = startedMs + 4 * 60_000;
  let restMs = 0;
  const sets = [];
  const prNames = new Set();

  templateDays[dayIndex].items.forEach((item, position) => {
    const kg = item.kg + item.step * round;
    for (let index = 1; index <= item.sets; index += 1) {
      const lastSet = index === item.sets;
      const reps = Math.max(1, item.reps - (lastSet && (sessionIndex + position) % 3 === 0 ? 2 : 0));
      const skipped = sessionIndex === 4 && position === 2 && lastSet;
      clock += 45_000;
      sets.push({
        exerciseName: item.name,
        exerciseId: `sys-ex-${item.slug}`,
        index,
        weight: kg,
        reps,
        status: skipped ? 'skipped' : 'completed',
        ...(skipped ? {} : { completedAt: iso(clock) }),
      });
      if (!lastSet) {
        clock += item.rest * 1000;
        restMs += item.rest * 1000;
      }
    }
    clock += 90_000;
  });

  for (const set of sets) {
    if (set.status !== 'completed') continue;
    const best = bestKg[set.exerciseName];
    if (best != null && set.weight > best) prNames.add(set.exerciseName);
  }
  for (const set of sets) {
    if (set.status === 'completed') bestKg[set.exerciseName] = Math.max(bestKg[set.exerciseName] ?? 0, set.weight);
  }

  const completedMs = clock;
  const pausedDurationMs = sessionIndex % 4 === 0 ? 3 * 60_000 : 0;
  const activeDurationMs = Math.max(0, completedMs - startedMs - pausedDurationMs - restMs);
  const volumeKg = Math.round(sets.filter((set) => set.status === 'completed').reduce((sum, set) => sum + set.weight * set.reps, 0));
  const weightKg = weightAt(completedMs);
  const mid = 6 * weightKg * (activeDurationMs / 3_600_000);
  const previous = lastVolume[source.id];
  const weekVolumeDeltaPercent =
    previous && completedMs - previous.at <= 7 * DAY_MS ? Math.round(((volumeKg - previous.volume) / previous.volume) * 100) : null;
  lastVolume[source.id] = { at: completedMs, volume: volumeKg };

  const id = randomUUID();
  return {
    ...base(id, iso(startedMs)),
    updatedAt: iso(completedMs),
    tenantId,
    userId: uid,
    planId: source.id,
    planTitle: source.title,
    dayId: day.id,
    dayName: day.name,
    startedAt: iso(startedMs),
    completedAt: iso(completedMs),
    status: 'completed',
    settled: true,
    pausedDurationMs,
    restDurationMs: restMs,
    sets,
    volumeKg,
    prCount: prNames.size,
    activeDurationMs,
    calories: {
      min: Math.round(mid * 0.85),
      max: Math.round(mid * 1.15),
      method: 'estimated_strength_training',
      weightKg,
      weightSource: 'member_measurement',
    },
    weekVolumeDeltaPercent,
  };
});

// One granted entry per workout (turnstile style), so the visit counters move too.
const accessLogs = sessions.map((session) => {
  const at = iso(new Date(session.startedAt).getTime() - 5 * 60_000);
  const id = randomUUID();
  return {
    ...base(id, at),
    tenantId,
    userId: uid,
    memberName: member.displayName ?? '',
    timestamp: at,
    direction: 'in',
    status: 'granted',
    method: 'qr',
    gateName: 'Ana Giriş',
  };
});

const writes = [
  ['gymWorkoutPlans', [trainerPlan, ownPlan]],
  ['gymMeasurements', measurements],
  ['gymWorkoutSessions', sessions],
  ['gymAccessLogs', accessLogs],
];

for (const [name, items] of writes) {
  if (!dryRun) {
    const batch = db.batch();
    items.forEach((item) => batch.set(tenantRef.collection(name).doc(item.id), item));
    await batch.commit();
  }
  console.log(`${dryRun ? '[dry-run] yazılacak' : 'Yazıldı'} ${name}: ${items.length}`);
}
const prs = sessions.reduce((sum, item) => sum + item.prCount, 0);
console.log(`Toplam hacim: ${sessions.reduce((sum, item) => sum + item.volumeKg, 0)} kg, PR: ${prs}. Temizlemek için --clean.`);
