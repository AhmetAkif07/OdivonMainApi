import { parseEnv, parsePrivateKey } from './env.schema';

export function loadConfiguration() {
  const env = parseEnv();
  return {
    nodeEnv: env.NODE_ENV,
    port: env.PORT,
    corsOrigin: env.CORS_ORIGIN,
    sessionMaxAgeDays: env.SESSION_MAX_AGE_DAYS,
    minClientVersion: env.MIN_CLIENT_VERSION,
    minClientVersions: parseMinimumVersions(env.MIN_CLIENT_VERSIONS),
    firebase: {
      projectId: env.FIREBASE_PROJECT_ID,
      clientEmail: env.FIREBASE_CLIENT_EMAIL,
      privateKey: parsePrivateKey(env.FIREBASE_PRIVATE_KEY),
      firestoreEmulatorHost: env.FIRESTORE_EMULATOR_HOST,
      authEmulatorHost: env.FIREBASE_AUTH_EMULATOR_HOST,
    },
  };
}

export function parseMinimumVersions(raw: string | undefined): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] =>
      typeof entry[1] === 'string' && /^\d+\.\d+\.\d+$/.test(entry[1]),
    ));
  } catch {
    return {};
  }
}

export type AppConfig = ReturnType<typeof loadConfiguration>;
