import { Injectable } from '@nestjs/common';
import { FirebaseService } from '../../shared/firebase/firebase.service';
import { ROOT_COLLECTION } from '../../shared/firebase/firestore-path';
import { UserProfile } from './entities/user-profile.entity';
import { TenantContext } from '../../shared/tenancy/tenant.context';

@Injectable()
export class IdentityRepository {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly tenantContext: TenantContext,
  ) {}

  private collection() {
    return this.firebase.db.collection(ROOT_COLLECTION.users);
  }

  async createProfile(profile: UserProfile): Promise<UserProfile> {
    await this.collection().doc(profile.uid).set(profile);
    return profile;
  }

  async findByUid(uid: string): Promise<UserProfile | null> {
    const snapshot = await this.collection().doc(uid).get();
    if (!snapshot.exists) {
      return null;
    }
    return snapshot.data() as UserProfile;
  }

  async listByCurrentTenant(): Promise<UserProfile[]> {
    const tenantId = this.tenantContext.getTenantId();
    const snapshot = await this.collection().where('tenantId', '==', tenantId).get();
    return snapshot.docs.map((doc) => doc.data() as UserProfile);
  }

  async findByVerificationToken(token: string): Promise<UserProfile | null> {
    const snapshot = await this.collection().where('emailVerificationToken', '==', token).limit(1).get();
    if (snapshot.empty) {
      return null;
    }
    return snapshot.docs[0].data() as UserProfile;
  }

  async findByEmail(email: string): Promise<UserProfile | null> {
    const snapshot = await this.collection().where('email', '==', email.trim().toLowerCase()).limit(1).get();
    if (snapshot.empty) {
      return null;
    }
    return snapshot.docs[0].data() as UserProfile;
  }

  async updateProfile(uid: string, patch: Partial<UserProfile>): Promise<void> {
    await this.collection().doc(uid).update(patch);
  }

  async hardDelete(uid: string): Promise<void> {
    await this.collection().doc(uid).delete();
  }
}
