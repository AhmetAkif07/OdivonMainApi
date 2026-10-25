export interface FgasEntitlements {
  readonly planId: 'starter' | 'pro' | 'enterprise';
  readonly maxEquipment: number | null;
  readonly maxOperations: number | null;
  readonly maxUsers: number | null;
  readonly advancedReports: boolean;
  readonly prioritySupport: boolean;
}

const PLANS: Record<FgasEntitlements['planId'], FgasEntitlements> = {
  starter: {
    planId: 'starter',
    maxEquipment: 100,
    maxOperations: 2_500,
    maxUsers: 3,
    advancedReports: false,
    prioritySupport: false,
  },
  pro: {
    planId: 'pro',
    maxEquipment: 1_000,
    maxOperations: 25_000,
    maxUsers: 15,
    advancedReports: true,
    prioritySupport: false,
  },
  enterprise: {
    planId: 'enterprise',
    maxEquipment: null,
    maxOperations: null,
    maxUsers: null,
    advancedReports: true,
    prioritySupport: true,
  },
};

export function fgasEntitlements(tenant: {
  planId?: string | null;
  membershipStatus?: string | null;
}): FgasEntitlements {
  if (tenant.membershipStatus === 'trial') return PLANS.pro;
  if (tenant.planId === 'starter' || tenant.planId === 'pro' || tenant.planId === 'enterprise')
    return PLANS[tenant.planId];
  return PLANS.enterprise;
}
