import { FirebaseService } from '../../../shared/firebase/firebase.service';
import { TENANT_COLLECTION, tenantCollectionPath } from '../../../shared/firebase/firestore-path';
import { createBaseFields } from '../../../shared/firestore/base-document';
import { GYM_ROLE_PERMISSIONS, GYM_STAFF_ROLE_LABELS, GYM_STAFF_ROLES, GymStaffRoleKey, gymRoleId } from './gym-roles';

/** Idempotent: creates the default gym staff roles that are missing, never overwrites edits. */
export async function ensureGymDefaultRoles(firebase: FirebaseService, tenantId: string, actorId: string): Promise<void> {
  const roles = firebase.db.collection(tenantCollectionPath(tenantId, TENANT_COLLECTION.roles));
  const refs = GYM_STAFF_ROLES.map((role) => roles.doc(gymRoleId(role)));
  const snapshots = await firebase.db.getAll(...refs);
  await Promise.all(
    snapshots.map((snapshot, index) => {
      if (snapshot.exists) return undefined;
      const role = GYM_STAFF_ROLES[index];
      return refs[index].set({
        ...createBaseFields(gymRoleId(role), actorId),
        name: `Salon - ${GYM_STAFF_ROLE_LABELS[role]}`,
        description: 'Salon modülü varsayılan rolü',
        permissions: GYM_ROLE_PERMISSIONS[role],
      });
    }),
  );
}

const STAFF_ROLE_TO_GYM_ROLE: Record<string, GymStaffRoleKey> = {
  admin: 'manager',
  receptionist: 'reception',
  trainer: 'trainer',
};
const DEFAULT_ROLE_IDS = new Set(GYM_STAFF_ROLES.map(gymRoleId));

/**
 * Sign-in profile fields for a staff record's role. The platform only knows owner / admin / user;
 * a trainer or receptionist is a `user` whose permissions come from the default gym role.
 * Roles the gym assigned by hand (other ids) are kept; only the default gym role is swapped.
 */
export function staffAccess(staffRole: string | null | undefined, currentRoleIds: readonly string[] = []) {
  const role = staffRole === 'owner' ? 'owner' : staffRole === 'admin' ? 'admin' : 'user';
  const gymRole = STAFF_ROLE_TO_GYM_ROLE[staffRole ?? 'trainer'];
  const kept = currentRoleIds.filter((id) => !DEFAULT_ROLE_IDS.has(id));
  return { role: role as 'owner' | 'admin' | 'user', roleIds: gymRole ? [...new Set([...kept, gymRoleId(gymRole)])] : kept };
}
