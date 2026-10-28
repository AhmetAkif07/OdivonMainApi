import { createHash } from 'crypto';
import { DocumentReference, Transaction } from 'firebase-admin/firestore';
import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { TENANT_COLLECTION } from '../../../shared/firebase/firestore-path';
import { HairStore } from './hair-store';

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

export interface IdempotencySlot<T> {
  /** The response of the first request with this key (a retry returns it unchanged). */
  replay: T | null;
  /** Records `response` under the key; call it inside the same transaction as the writes. */
  save(response: T): void;
}

/**
 * Optional client `idempotencyKey` for money-moving POSTs (payments, expenses, package sales,
 * refunds, register open/close). Read FIRST inside the operation's transaction: a retry with the same
 * key returns the stored response, the same key with a different body is 409 IDEMPOTENCY_CONFLICT.
 * Keys are namespaced per operation (`hairIdempotency/{scope}_{key}`).
 */
export async function idempotency<T>(
  tx: Transaction,
  store: HairStore,
  scope: string,
  key: string | undefined,
  body: object,
): Promise<IdempotencySlot<T>> {
  if (!key) return { replay: null, save: () => undefined };
  const ref: DocumentReference = store.ref(TENANT_COLLECTION.hairIdempotency, `${scope}_${key}`);
  const requestHash = hashBody(body);
  const snapshot = await tx.get(ref);
  const stored = snapshot.exists ? snapshot.data() : undefined;
  if (stored && String(stored['expiresAt'] ?? '') > new Date().toISOString()) {
    if (stored['requestHash'] !== requestHash) {
      throw new AppException(
        ErrorCode.IDEMPOTENCY_CONFLICT,
        'Bu işlem anahtarı farklı bir istekle zaten kullanıldı.',
      );
    }
    return { replay: JSON.parse(String(stored['response'])) as T, save: () => undefined };
  }
  return {
    replay: null,
    save: (response: T) =>
      tx.set(ref, {
        scope,
        requestHash,
        // Stored as JSON: Firestore rejects nested undefined values and arrays of arrays.
        response: JSON.stringify(response),
        createdBy: store.userId(),
        expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_MS).toISOString(),
      }),
  };
}

function hashBody(body: object): string {
  const { idempotencyKey: _key, ...rest } = body as Record<string, unknown>;
  return createHash('sha256').update(stableJson(rest)).digest('hex');
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
