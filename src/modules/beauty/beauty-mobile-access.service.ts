import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DecodedIdToken } from 'firebase-admin/auth';
import { FirebaseService } from '../../shared/firebase/firebase.service';
import { ROOT_COLLECTION, tenantCollectionPath } from '../../shared/firebase/firestore-path';
import { beautyRoleId } from './shared/beauty-roles';

@Injectable()
export class BeautyMobileAccessService {
  constructor(private readonly firebase: FirebaseService) {}

  async connectCustomer(centerCode: string, token: DecodedIdToken) {
    if (!token.phone_number) {
      throw new ForbiddenException('Musteri erisimi icin dogrulanmis telefon numarasi gereklidir.');
    }
    const code = centerCode.trim().toUpperCase();
    const settings = await this.firebase.db
      .collectionGroup('beautySettings')
      .where('centerCode', '==', code)
      .limit(2)
      .get();
    if (settings.size !== 1) throw new NotFoundException('Guzellik merkezi kodu bulunamadi.');
    const tenantRef = settings.docs[0].ref.parent.parent;
    if (!tenantRef) throw new NotFoundException('Tenant bulunamadi.');
    const tenantId = tenantRef.id;
    const customerCollection = this.firebase.db.collection(
      tenantCollectionPath(tenantId, 'beautyCustomers'),
    );
    const exact = await customerCollection.where('phone', '==', token.phone_number).limit(2).get();
    const candidates = exact.empty
      ? (await customerCollection.limit(200).get()).docs.filter(
          (document) =>
            normalizePhone(document.data()['phone']) === normalizePhone(token.phone_number),
        )
      : exact.docs;
    if (candidates.length !== 1) {
      throw new NotFoundException('Bu telefon numarasina ait tekil bir musteri karti bulunamadi.');
    }
    const customer = candidates[0];
    const existingUserId = customer.data()['userId'];
    if (typeof existingUserId === 'string' && existingUserId && existingUserId !== token.uid) {
      throw new ConflictException('Musteri karti baska bir hesaba bagli.');
    }

    const userRef = this.firebase.db.collection(ROOT_COLLECTION.users).doc(token.uid);
    const userSnapshot = await userRef.get();
    const currentTenant = userSnapshot.data()?.['tenantId'];
    if (typeof currentTenant === 'string' && currentTenant && currentTenant !== tenantId) {
      throw new ConflictException('Bu hesap baska bir guzellik merkezine bagli.');
    }

    const now = new Date().toISOString();
    const batch = this.firebase.db.batch();
    batch.set(
      userRef,
      {
        uid: token.uid,
        tenantId,
        role: 'user',
        modules: ['beauty'],
        roleIds: [beautyRoleId('customer')],
        email: token.email ?? '',
        phone: token.phone_number,
        displayName: token.name ?? customer.data()['fullName'] ?? customer.data()['name'] ?? null,
        status: 'active',
        createdAt: userSnapshot.data()?.['createdAt'] ?? now,
        updatedAt: now,
      },
      { merge: true },
    );
    batch.update(customer.ref, {
      userId: token.uid,
      phoneE164: token.phone_number,
      updatedAt: now,
    });
    await batch.commit();
    await this.firebase.auth.setCustomUserClaims(token.uid, {
      tenantId,
      role: 'user',
      modules: ['beauty'],
    });
    return { tenantId, customerId: customer.id, tokenRefreshRequired: true };
  }
}

function normalizePhone(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\D/g, '').replace(/^0/, '90') : '';
}
