import { CollectionReference } from 'firebase-admin/firestore';
import { FirebaseService } from '../../../shared/firebase/firebase.service';
import { tenantCollectionPath } from '../../../shared/firebase/firestore-path';
import { isDeleted } from '../../../shared/firestore/base-document';
import { TenantContext } from '../../../shared/tenancy/tenant.context';

export function gymCollection(
  firebase: FirebaseService,
  tenantContext: TenantContext,
  name: string,
) {
  return firebase.db.collection(tenantCollectionPath(tenantContext.getTenantId(), name));
}

export async function listUndeleted<T extends { deletedAt?: string | null; createdAt?: string; id?: string }>(
  collection: CollectionReference,
): Promise<T[]> {
  const snapshot = await collection.get();
  return snapshot.docs
    .map((doc) => doc.data() as T)
    .filter((item) => !isDeleted(item))
    .sort(
      (left, right) =>
        (right.createdAt ?? '').localeCompare(left.createdAt ?? '') || (right.id ?? '').localeCompare(left.id ?? ''),
    );
}
