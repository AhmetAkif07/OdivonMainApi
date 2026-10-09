import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

function loadEnv(path) {
  if (!existsSync(path)) return;
  const text = readFileSync(path, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index < 0) continue;
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

const emailArg = process.argv[2]?.trim().toLowerCase();
const isRevoke = process.argv.includes('--revoke');

if (!emailArg || emailArg === '--revoke') {
  console.error('Kullanım: node scripts/grant-platform-admin.mjs <admin-email> [--revoke]');
  process.exit(1);
}

const projectId = process.env.FIREBASE_PROJECT_ID || 'odivon-main-api-a2095';
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

const app =
  getApps()[0] ??
  initializeApp(
    clientEmail && privateKey
      ? { projectId, credential: cert({ projectId, clientEmail, privateKey }) }
      : { projectId },
  );

const auth = getAuth(app);
const db = getFirestore(app);

async function main() {
  console.log(`İşlem yapılıyor: ${emailArg} (Mod: ${isRevoke ? 'REVOKE' : 'GRANT'})...`);
  let user;
  try {
    user = await auth.getUserByEmail(emailArg);
  } catch (err) {
    console.error(`Kullanıcı Firebase Auth üzerinde bulunamadı: ${emailArg}`, err.message);
    process.exit(1);
  }

  const adminRef = db.collection('platformAdmins').doc(user.uid);
  const now = new Date().toISOString();
  const currentClaims = user.customClaims || {};

  if (isRevoke) {
    await adminRef.set(
      {
        uid: user.uid,
        email: user.email,
        status: 'inactive',
        revokedAt: now,
        updatedAt: now,
      },
      { merge: true },
    );
    const { platformAdmin, ...remainingClaims } = currentClaims;
    await auth.setCustomUserClaims(user.uid, remainingClaims);
    await auth.revokeRefreshTokens(user.uid);
    console.log(`[BAŞARILI] ${emailArg} (${user.uid}) kullanıcısının platform admin yetkisi kaldırıldı.`);
  } else {
    await adminRef.set(
      {
        uid: user.uid,
        email: user.email,
        status: 'active',
        grantedAt: now,
        updatedAt: now,
      },
      { merge: true },
    );
    await auth.setCustomUserClaims(user.uid, {
      ...currentClaims,
      platformAdmin: true,
    });
    console.log(`[BAŞARILI] ${emailArg} (${user.uid}) kullanıcısına platform admin yetkisi verildi.`);
  }
}

main().catch((err) => {
  console.error('Hata oluştu:', err);
  process.exit(1);
});
