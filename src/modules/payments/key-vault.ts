import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { AppException } from '../../shared/errors/app.exception';
import { ErrorCode } from '../../shared/errors/error-codes';

/**
 * Encryption at rest for gym payment keys (AES-256-GCM). The 32-byte key comes from the Worker
 * secret PAYMENT_KEYS_ENC_KEY (base64); without it, keys can be neither saved nor used.
 * Format: `v1.<iv>.<ciphertext>.<tag>` (base64url parts).
 */
const VERSION = 'v1';

export function encryptionKey(raw = process.env.PAYMENT_KEYS_ENC_KEY): Buffer {
  const key = raw ? Buffer.from(raw, 'base64') : Buffer.alloc(0);
  if (key.length !== 32) {
    throw new AppException(ErrorCode.INVALID_STATUS, 'Payment key encryption is not configured (PAYMENT_KEYS_ENC_KEY)');
  }
  return key;
}

export function encryptSecret(plain: string, key = encryptionKey()): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [VERSION, iv.toString('base64url'), data.toString('base64url'), cipher.getAuthTag().toString('base64url')].join('.');
}

export function decryptSecret(sealed: string, key = encryptionKey()): string {
  const [version, iv, data, tag] = sealed.split('.');
  if (version !== VERSION || !iv || !data || !tag) {
    throw new AppException(ErrorCode.INVALID_STATUS, 'Stored payment key has an unknown format');
  }
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    throw new AppException(ErrorCode.INVALID_STATUS, 'Stored payment key cannot be decrypted');
  }
}

/** What clients may see of a key: its last four characters. */
export function maskKey(value: string): string {
  return value.length <= 4 ? '••••' : `••••${value.slice(-4)}`;
}
