import { TENANT_COLLECTION } from '../../../shared/firebase/firestore-path';
import { BaseDocument } from '../../../shared/firestore/base-document';
import { TenantStore } from '../../../shared/tenancy/tenant.context';
import { GymStore } from './gym-store';

type Doc = BaseDocument & Record<string, unknown>;

export interface TrainerIdentity {
  /** Every id a member's or plan's `trainerId` may hold for this account: the staff record and the sign-in uid. */
  ids: string[];
  staffId: string | null;
  name: string;
}

/**
 * A trainer works with programs but does not manage members; such an account only sees its own
 * members' requests. Owners, managers and reception see everything.
 */
export function isTrainerOnly(ctx: TenantStore): boolean {
  if (ctx.role === 'owner' || ctx.role === 'admin') return false;
  const members = ctx.permissions?.members ?? [];
  const workouts = ctx.permissions?.workouts ?? [];
  return workouts.includes('create') && !members.includes('update') && !members.includes('create');
}

/**
 * The staff record of the signed-in account. The panel writes `trainerId` sometimes as the staff
 * record id and sometimes as the sign-in uid, so both count as "me".
 */
export async function trainerIdentity(store: GymStore, ctx: TenantStore): Promise<TrainerIdentity> {
  const staff = await store.list<Doc>(TENANT_COLLECTION.gymStaff);
  const email = ctx.email.trim().toLowerCase();
  const mine =
    staff.find((item) => item['userId'] === ctx.userId) ??
    (email ? staff.find((item) => String(item['email'] ?? '').trim().toLowerCase() === email) : undefined);
  const ids = [...new Set([mine?.id, ctx.userId].filter((id): id is string => Boolean(id)))];
  return {
    ids,
    staffId: mine?.id ?? null,
    name: String(mine?.['displayName'] ?? ctx.displayName ?? '').trim() || 'Antrenör',
  };
}
