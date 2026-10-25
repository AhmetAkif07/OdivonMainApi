// Bir kullanıcının e-postasını doğrulanmış olarak işaretler (Firebase Auth + users profili).
// Kullanım: node scripts/mark-email-verified.mjs <email>
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

const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  console.error('Kullanım: node scripts/mark-email-verified.mjs <email>');
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
  const user = await auth.getUserByEmail(email).catch(() => null);
  if (!user) {
    console.error(`Firebase Auth'ta kullanıcı bulunamadı: ${email}`);
    process.exit(1);
  }
  await auth.updateUser(user.uid, { emailVerified: true });

  const ref = db.collection('users').doc(user.uid);
  const snapshot = await ref.get();
  if (snapshot.exists) {
    await ref.update({
      emailVerified: true,
      emailVerificationToken: null,
      emailVerificationExpiresAt: null,
      updatedAt: new Date().toISOString(),
    });
  }
  const profile = snapshot.exists ? snapshot.data() : null;
  console.log(
    `[BAŞARILI] ${email} doğrulandı. uid=${user.uid} profil=${snapshot.exists ? 'var' : 'YOK'}` +
      (profile ? ` tenantId=${profile.tenantId} modules=${(profile.modules || []).join(',')} role=${profile.role}` : ''),
  );
}

main().catch((error) => {
  console.error('Hata:', error.message);
  process.exit(1);
});
