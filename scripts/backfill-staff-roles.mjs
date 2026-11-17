// Gives gym staff accounts created before the fix their default gym role.
//
// Staff added from the panel got a sign-in profile without `roleIds`, so the API loaded no
// permissions for them (403 on every staff route). This writes `roleIds: ['gym-<role>']` and the
// platform role `user` (trainer / receptionist) or `admin` to those profiles, and creates the
// default role documents of the tenant when missing. It never removes roles and never touches
// owners, members or profiles that already have roles.
//
//   node scripts/backfill-staff-roles.mjs            # report only
//   node scripts/backfill-staff-roles.mjs --apply    # write
//   node scripts/backfill-staff-roles.mjs --tenant <id> [--apply]
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

function loadEnv(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index < 0) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnv(resolve(import.meta.dirname, '..', '.env'));

const apply = process.argv.includes('--apply');
const tenantIndex = process.argv.indexOf('--tenant');
const onlyTenant = tenantIndex > 0 ? process.argv[tenantIndex + 1] : null;

const projectId = process.env.FIREBASE_PROJECT_ID || 'odivon-main-api-a2095';
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
const app =
  getApps()[0] ??
  initializeApp(clientEmail && privateKey ? { projectId, credential: cert({ projectId, clientEmail, privateKey }) } : { projectId });
const auth = getAuth(app);
const db = getFirestore(app);

// Keep in step with src/modules/gym/shared/gym-roles.ts.
const ALL = ['view', 'create', 'update', 'delete'];
const ROLE_DOCS = {
  'gym-manager': {
    name: 'Salon - Yönetici',
    permissions: {
      members: ALL, packages: ALL, branches: ALL, staff: ALL, gymInfo: ALL, classes: ALL, gymAppointments: ALL,
      workouts: ALL, measurements: ALL, water: ALL, wallet: ALL, receivables: ALL, shop: ALL, accounting: ALL,
      accessControl: ALL, campaigns: ALL, guestMembers: ALL, disciplines: ALL, gymSuppliers: ALL, memberDocuments: ALL,
      sms: ALL, eInvoice: ALL, saas: ['view'], gymAudit: ['view'], reminders: ALL, reports: ['view'], users: ['view'],
    },
  },
  'gym-reception': {
    name: 'Salon - Resepsiyon',
    permissions: {
      members: ['view', 'create', 'update'], packages: ['view'], branches: ['view'], staff: ['view'], gymInfo: ['view'],
      classes: ['view', 'create', 'update'], gymAppointments: ['view', 'create', 'update'], workouts: ['view'],
      measurements: ['view', 'create'], wallet: ['view', 'create'], receivables: ['view', 'create'], shop: ['view', 'create'],
      accessControl: ['view', 'create'], campaigns: ['view'], guestMembers: ['view', 'create', 'update'], disciplines: ['view'],
      memberDocuments: ['view', 'create', 'update'], saas: ['view'], reminders: ['view'],
    },
  },
  'gym-trainer': {
    name: 'Salon - Antrenör',
    permissions: {
      members: ['view'], packages: ['view'], branches: ['view'], staff: ['view'], gymInfo: ['view'], classes: ['view', 'update'],
      gymAppointments: ['view', 'create', 'update'], workouts: ALL, measurements: ['view', 'create', 'update'], water: ['view'],
      guestMembers: ['view'], disciplines: ['view'], memberDocuments: ['view'], saas: ['view'],
    },
  },
};
const STAFF_ROLE = { admin: 'gym-manager', receptionist: 'gym-reception', trainer: 'gym-trainer' };

async function ensureRoles(tenantId) {
  const created = [];
  for (const [id, role] of Object.entries(ROLE_DOCS)) {
    const ref = db.doc(`tenants/${tenantId}/roles/${id}`);
    if ((await ref.get()).exists) continue;
    created.push(id);
    if (!apply) continue;
    const now = new Date().toISOString();
    await ref.set({
      id, createdAt: now, updatedAt: now, createdBy: 'backfill-staff-roles', updatedBy: 'backfill-staff-roles', deletedAt: null,
      name: role.name, description: 'Salon modülü varsayılan rolü', permissions: role.permissions,
    });
  }
  return created;
}

async function main() {
  console.log(`Personel rol geri doldurması · ${apply ? 'YAZ' : 'yalnız rapor'}${onlyTenant ? ` · tenant ${onlyTenant}` : ''}`);
  const tenants = onlyTenant ? [onlyTenant] : (await db.collection('tenants').listDocuments()).map((ref) => ref.id);
  let fixed = 0;
  for (const tenantId of tenants) {
    const staff = (await db.collection(`tenants/${tenantId}/gymStaff`).get()).docs
      .map((doc) => doc.data())
      .filter((item) => !item.deletedAt);
    const pending = [];
    for (const item of staff) {
      const roleId = STAFF_ROLE[item.role];
      if (!roleId) continue;
      let uid = item.userId;
      if (!uid && item.email) uid = (await auth.getUserByEmail(String(item.email).trim().toLowerCase()).catch(() => null))?.uid;
      if (!uid) continue;
      const ref = db.doc(`users/${uid}`);
      const profile = (await ref.get()).data();
      if (!profile || profile.tenantId !== tenantId) continue;
      if (profile.accountType === 'gym_member' || profile.role === 'owner') continue;
      if (Array.isArray(profile.roleIds) && profile.roleIds.length) continue;
      pending.push({ uid, ref, roleId, platformRole: item.role === 'admin' ? 'admin' : 'user', name: item.displayName, from: profile.role });
    }
    if (!pending.length) continue;
    const roles = await ensureRoles(tenantId);
    console.log(`\n${tenantId}: ${pending.length} personel${roles.length ? ` · eksik roller: ${roles.join(', ')}` : ''}`);
    for (const item of pending) {
      console.log(`  ${item.name ?? item.uid}: role ${item.from} → ${item.platformRole}, roleIds → [${item.roleId}]`);
      if (!apply) continue;
      await item.ref.update({ role: item.platformRole, roleIds: [item.roleId], updatedAt: new Date().toISOString() });
      const user = await auth.getUser(item.uid).catch(() => null);
      if (user) await auth.setCustomUserClaims(item.uid, { ...(user.customClaims ?? {}), role: item.platformRole });
      fixed++;
    }
  }
  console.log(apply ? `\n${fixed} profil güncellendi.` : '\nRapor bitti; yazmak için --apply ekle.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
