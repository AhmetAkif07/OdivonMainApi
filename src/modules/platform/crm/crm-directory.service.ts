import { Injectable } from '@nestjs/common';
import { FirebaseService } from '../../../shared/firebase/firebase.service';
import { ROOT_COLLECTION } from '../../../shared/firebase/firestore-path';
import { TenantDocument } from '../../tenant/entities/tenant.entity';
import { UserProfile } from '../../identity/entities/user-profile.entity';

/** Who a mail address belongs to on the platform. */
export interface CrmContact {
  email: string;
  uid: string;
  displayName: string | null;
  role: string | null;
  tenantId: string;
  tenantName: string;
  modules: string[];
  isDemo: boolean;
  membershipStatus: string | null;
}

export interface CampaignAudience {
  /** Tenants that use any of these modules; empty means every module. */
  modules?: string[];
  tenantStatus?: 'active' | 'inactive' | 'all';
  /** Odivon subscription state; empty means any. */
  membership?: Array<'trial' | 'active' | 'expired' | 'cancelled'>;
  includeDemo?: boolean;
  /** When set, only these tenants (other filters still apply). */
  tenantIds?: string[];
  /** owners: the tenant owner (or first owner/admin). staff: every active staff user of the tenant. */
  recipients?: 'owners' | 'staff';
  /** Extra addresses that always receive the mail (mail campaigns only). */
  extraEmails?: string[];
}

export interface AudienceTenant {
  id: string;
  name: string;
  modules: string[];
  emails: { email: string; name: string | null }[];
}

interface DirectorySnapshot {
  at: number;
  tenants: Map<string, TenantDocument & { id: string }>;
  users: (UserProfile & { uid: string })[];
}

const CACHE_MS = 5 * 60_000;
const STAFF_ROLES_FOR_OWNERS = ['owner', 'admin'];

@Injectable()
export class CrmDirectoryService {
  private snapshot: DirectorySnapshot | null = null;

  constructor(private readonly firebase: FirebaseService) {}

  /** Tenants and users, cached for a few minutes so the inbox can tag every sender cheaply. */
  private async load(force = false): Promise<DirectorySnapshot> {
    if (!force && this.snapshot && Date.now() - this.snapshot.at < CACHE_MS) return this.snapshot;
    const [tenantsSnap, usersSnap] = await Promise.all([
      this.firebase.db.collection(ROOT_COLLECTION.tenants).get(),
      this.firebase.db.collection(ROOT_COLLECTION.users).get(),
    ]);
    const tenants = new Map<string, TenantDocument & { id: string }>();
    tenantsSnap.docs.forEach((d) => tenants.set(d.id, { ...(d.data() as TenantDocument), id: d.id }));
    const users = usersSnap.docs.map((d) => ({ ...(d.data() as UserProfile), uid: d.id }));
    this.snapshot = { at: Date.now(), tenants, users };
    return this.snapshot;
  }

  /** Maps each address (lower-case) to the platform user and tenant behind it. */
  async lookup(emails: string[]): Promise<Map<string, CrmContact>> {
    const wanted = new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean));
    const result = new Map<string, CrmContact>();
    if (!wanted.size) return result;
    const { tenants, users } = await this.load();
    for (const user of users) {
      const email = (user.email || '').toLowerCase();
      if (!wanted.has(email) || result.has(email)) continue;
      if ((user as { accountType?: string }).accountType === 'gym_member') continue;
      const tenant = tenants.get(user.tenantId);
      result.set(email, {
        email,
        uid: user.uid,
        displayName: user.displayName ?? null,
        role: user.role ?? null,
        tenantId: user.tenantId,
        tenantName: tenant?.name ?? '',
        modules: tenant?.modules ?? [],
        isDemo: Boolean(tenant?.isDemo),
        membershipStatus: tenant?.membershipStatus ?? null,
      });
    }
    return result;
  }

  /** Staff contacts of one tenant (for the "write to this tenant" shortcut). */
  async tenantContacts(tenantId: string): Promise<{ email: string; name: string | null; role: string | null }[]> {
    const { users } = await this.load();
    return users
      .filter((u) => u.tenantId === tenantId && u.email && (u as { accountType?: string }).accountType !== 'gym_member')
      .map((u) => ({ email: u.email, name: u.displayName ?? null, role: u.role ?? null }));
  }

  /** Tenants matching the audience, each with the addresses that should receive the message. */
  async resolveAudience(audience: CampaignAudience, force = true): Promise<AudienceTenant[]> {
    const { tenants, users } = await this.load(force);
    const byTenant = new Map<string, (UserProfile & { uid: string })[]>();
    for (const u of users) {
      if (!u.tenantId || !u.email) continue;
      if ((u as { accountType?: string }).accountType === 'gym_member') continue;
      if (u.status && u.status !== 'active') continue;
      const list = byTenant.get(u.tenantId) ?? [];
      list.push(u);
      byTenant.set(u.tenantId, list);
    }

    const result: AudienceTenant[] = [];
    for (const tenant of tenants.values()) {
      if (!matchesAudience(tenant, audience)) continue;
      const staff = byTenant.get(tenant.id) ?? [];
      let picked: (UserProfile & { uid: string })[];
      if (audience.recipients === 'staff') {
        picked = staff;
      } else {
        const owner = staff.find((u) => u.uid === tenant.ownerUid);
        picked = owner ? [owner] : staff.filter((u) => STAFF_ROLES_FOR_OWNERS.includes(String(u.role))).slice(0, 1);
      }
      const seen = new Set<string>();
      const emails = picked
        .map((u) => ({ email: u.email.trim().toLowerCase(), name: u.displayName ?? null }))
        .filter((e) => (seen.has(e.email) ? false : (seen.add(e.email), true)));
      result.push({ id: tenant.id, name: tenant.name ?? '', modules: tenant.modules ?? [], emails });
    }
    return result.sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  }

  invalidate(): void {
    this.snapshot = null;
  }
}

export function matchesAudience(
  tenant: Pick<TenantDocument, 'modules' | 'status' | 'isDemo' | 'membershipStatus'> & { id: string; deletedAt?: string | null },
  audience: CampaignAudience,
): boolean {
  if (tenant.deletedAt) return false;
  if (audience.tenantIds?.length && !audience.tenantIds.includes(tenant.id)) return false;
  if (!audience.includeDemo && tenant.isDemo) return false;
  const status = audience.tenantStatus ?? 'active';
  if (status !== 'all' && tenant.status !== status) return false;
  if (audience.modules?.length && !(tenant.modules ?? []).some((m) => audience.modules!.includes(m))) return false;
  if (audience.membership?.length && !audience.membership.includes(tenant.membershipStatus ?? ('' as never))) return false;
  return true;
}
