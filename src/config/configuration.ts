import { parseEnv, parsePrivateKey } from './env.schema';

export function loadConfiguration() {
  const env = parseEnv();
  return {
    nodeEnv: env.NODE_ENV,
    port: env.PORT,
    corsOrigin: env.CORS_ORIGIN,
    firebase: {
      projectId: env.FIREBASE_PROJECT_ID,
      clientEmail: env.FIREBASE_CLIENT_EMAIL,
      privateKey: parsePrivateKey(env.FIREBASE_PRIVATE_KEY),
      firestoreEmulatorHost: env.FIRESTORE_EMULATOR_HOST,
      authEmulatorHost: env.FIREBASE_AUTH_EMULATOR_HOST,
    },
  };
}

export type AppConfig = ReturnType<typeof loadConfiguration>;
