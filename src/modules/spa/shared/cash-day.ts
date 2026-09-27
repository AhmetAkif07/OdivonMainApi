import { Transaction } from 'firebase-admin/firestore';
import { TENANT_COLLECTION } from '../../../shared/firebase/firestore-path';
import { spaPrecondition } from './spa-errors';
import { SpaStore } from './spa-store';
import { dateIdInTz } from './spa-time';

/**
 * Money written now lands in today's cash register day (by `createdAt`). Once that day is closed its
 * snapshot is final, so new sessions/payments/refunds wait until an admin reopens it. Pass the
 * transaction so the check and the write are atomic.
 */
export async function assertCashDayOpen(
  tx: Transaction,
  store: SpaStore,
  timeZone: string,
): Promise<void> {
  const snapshot = await tx.get(
    store.doc(TENANT_COLLECTION.spaCashRegisterDays, dateIdInTz(timeZone)),
  );
  if (snapshot.exists && snapshot.data()?.['status'] === 'closed') {
    throw spaPrecondition(
      'Bugünün kasası kapatılmış. Yeni işlem için önce yönetici kasayı yeniden açmalı.',
    );
  }
}
