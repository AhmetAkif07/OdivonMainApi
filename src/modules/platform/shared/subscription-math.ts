const DAY_MS = 86_400_000;

export function addDaysToDate(baseDate: Date, days: number): Date {
  return new Date(baseDate.getTime() + days * DAY_MS);
}

/**
 * Extends trial end date.
 * If current trial end is in the future, adds days to it.
 * If in the past or missing, adds days to `now`.
 */
export function calculateExtendedDate(
  currentEndIso: string | null | undefined,
  days: number,
  now = new Date(),
): string {
  const currentMs = Date.parse(currentEndIso ?? '');
  const base = Number.isFinite(currentMs) && currentMs > now.getTime() ? new Date(currentMs) : now;
  return addDaysToDate(base, days).toISOString();
}

/**
 * Difference in full calendar days between now and target date.
 * Positive = remaining in future, Negative = expired.
 */
export function daysDifference(targetIso: string | null | undefined, now = new Date()): number | null {
  if (!targetIso) return null;
  const targetMs = Date.parse(targetIso);
  if (!Number.isFinite(targetMs)) return null;
  return Math.round((targetMs - now.getTime()) / DAY_MS);
}

export type TenantComputedStatus = 'active' | 'trial' | 'expired' | 'suspended';

export interface TenantEffectiveState {
  computedStatus: TenantComputedStatus;
  isExpired: boolean;
  isSuspended: boolean;
  isInTrial: boolean;
  daysLeft: number | null;
  effectiveEndsAt: string | null;
}

export function computeTenantStatus(
  tenant: {
    status?: 'active' | 'inactive';
    membershipStatus?: 'trial' | 'active' | 'expired' | 'cancelled';
    trialEndsAt?: string | null;
    subscriptionEndsAt?: string | null;
  },
  now = new Date(),
): TenantEffectiveState {
  const isSuspended = tenant.status === 'inactive';
  if (isSuspended) {
    return {
      computedStatus: 'suspended',
      isExpired: false,
      isSuspended: true,
      isInTrial: tenant.membershipStatus === 'trial',
      daysLeft: null,
      effectiveEndsAt: tenant.subscriptionEndsAt ?? tenant.trialEndsAt ?? null,
    };
  }

  const membership = tenant.membershipStatus ?? 'active';

  if (membership === 'trial') {
    const trialEndMs = Date.parse(tenant.trialEndsAt ?? '');
    const isExpired = !Number.isFinite(trialEndMs) || now.getTime() > trialEndMs;
    const days = daysDifference(tenant.trialEndsAt, now);
    return {
      computedStatus: isExpired ? 'expired' : 'trial',
      isExpired,
      isSuspended: false,
      isInTrial: true,
      daysLeft: days,
      effectiveEndsAt: tenant.trialEndsAt ?? null,
    };
  }

  // Active / Paid subscription
  if (tenant.subscriptionEndsAt) {
    const subEndMs = Date.parse(tenant.subscriptionEndsAt);
    const isExpired = Number.isFinite(subEndMs) && now.getTime() > subEndMs;
    const days = daysDifference(tenant.subscriptionEndsAt, now);
    return {
      computedStatus: isExpired ? 'expired' : 'active',
      isExpired,
      isSuspended: false,
      isInTrial: false,
      daysLeft: days,
      effectiveEndsAt: tenant.subscriptionEndsAt,
    };
  }

  return {
    computedStatus: 'active',
    isExpired: false,
    isSuspended: false,
    isInTrial: false,
    daysLeft: null,
    effectiveEndsAt: null,
  };
}
