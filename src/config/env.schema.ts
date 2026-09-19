import { z } from 'zod';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    FIREBASE_PROJECT_ID: z.string().min(1),
    FIREBASE_CLIENT_EMAIL: z.string().email().optional(),
    FIREBASE_PRIVATE_KEY: z.string().optional(),
    FIRESTORE_EMULATOR_HOST: z.string().optional(),
    FIREBASE_AUTH_EMULATOR_HOST: z.string().optional(),
    CORS_ORIGIN: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    const usingEmulator = Boolean(
      data.FIRESTORE_EMULATOR_HOST || data.FIREBASE_AUTH_EMULATOR_HOST,
    );
    const needsCredentials = data.NODE_ENV === 'production' || !usingEmulator;
    if (data.NODE_ENV === 'test') {
      return;
    }
    if (needsCredentials && (!data.FIREBASE_CLIENT_EMAIL || !data.FIREBASE_PRIVATE_KEY)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY are required unless emulators are configured',
        path: ['FIREBASE_PRIVATE_KEY'],
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export function parseEnv(env: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    const details = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    throw new Error(`Invalid environment: ${details.join('; ')}`);
  }
  return result.data;
}

export function parsePrivateKey(raw: string | undefined): string | undefined {
  if (!raw) {
    return undefined;
  }
  return raw.replace(/\\n/g, '\n');
}
