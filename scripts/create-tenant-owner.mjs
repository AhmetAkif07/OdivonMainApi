// Kayıt akışıyla (identity/register) aynı kayıtları Firebase Admin ile oluşturur:
// Auth kullanıcısı, tenant, users profili ve custom claims. E-posta doğrulanmış olarak işaretlenir.
// Şifre komut satırına değil ACCOUNT_PASSWORD ortam değişkenine verilir.
// Kullanım (PowerShell):
//   $env:ACCOUNT_PASSWORD="..."; node scripts/create-tenant-owner.mjs <email> --module vet --tenant "Odivon Vet"; Remove-Item Env:ACCOUNT_PASSWORD
import { readFileSync, existsSync } from 'node:fs';
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
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnv(resolve(import.meta.dirname, '..', '.env'));

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const email = args[0]?.trim().toLowerCase();
const productModule = option('--module', 'vet');
const tenantName = option('--tenant', 'Odivon Vet');
const password = process.env.ACCOUNT_PASSWORD;

if (!email || email.startsWith('--') || !password) {
  console.error('Kullanım: ACCOUNT_PASSWORD=... node scripts/create-tenant-owner.mjs <email> [--module vet] [--tenant "Ad"]');
  process.exit(1);
}

const projectId = process.env.FIREBASE_PROJECT_ID || 'odivon-main-api-a2095';
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
const app =
  getApps()[0] ??
  initializeApp(clientEmail && privateKey ? { projectId, credential: cert({ projectId, clientEmail, privateKey }) } : { projectId });
const auth = getAuth(app);
const db = getFirestore(app);

async function main() {
  const existing = await auth.getUserByEmail(email).catch(() => null);
  if (existing) {
    console.error(`Bu e-posta zaten kayıtlı: ${email} (${existing.uid}). İşlem yapılmadı.`);
    process.exit(1);
  }

  const now = new Date().toISOString();
  const modules = [productModule];
  const user = await auth.createUser({ email, password, emailVerified: true });
  const tenantRef = db.collection('tenants').doc();
  try {
    await tenantRef.set({
      id: tenantRef.id,
      createdAt: now,
      updatedAt: now,
      createdBy: user.uid,
      updatedBy: user.uid,
      deletedAt: null,
      name: tenantName,
      ownerUid: user.uid,
      modules,
      status: 'active',
      onboardingCompleted: !modules.some((m) => m === 'gym' || m === 'fgas'),
      membershipStatus: 'active',
      trialEndsAt: null,
    });
    await db.collection('users').doc(user.uid).set({
      uid: user.uid,
      tenantId: tenantRef.id,
      role: 'owner',
      modules,
      email,
      emailVerified: true,
      emailVerificationToken: null,
      emailVerificationExpiresAt: null,
      displayName: null,
      phone: null,
      status: 'active',
      membershipStatus: 'active',
      trialStartedAt: null,
      trialEndsAt: null,
      createdAt: now,
      updatedAt: now,
    });
    await auth.setCustomUserClaims(user.uid, { tenantId: tenantRef.id, role: 'owner', modules });
  } catch (error) {
    await db.collection('users').doc(user.uid).delete().catch(() => {});
    await tenantRef.delete().catch(() => {});
    await auth.deleteUser(user.uid).catch(() => {});
    throw error;
  }
  console.log(`[BAŞARILI] ${email} oluşturuldu. uid=${user.uid} tenantId=${tenantRef.id} modules=${modules.join(',')}`);
}

main().catch((error) => {
  console.error('Hata:', error.message);
  process.exit(1);
});
