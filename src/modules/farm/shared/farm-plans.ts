export const FARM_PLAN_IDS = ['trial', 'starter', 'pro', 'enterprise'] as const;
export type FarmPlanId = (typeof FARM_PLAN_IDS)[number];

export const BILLING_CYCLES = ['monthly', 'yearly'] as const;
export const PAYMENT_METHODS = ['credit_card', 'bank_transfer'] as const;

export interface FarmPlan {
  monthlyPrice: number;
  yearlyPrice: number;
  animalLimit: number;
  userLimit: number;
  storageLimitMb: number;
}

/** Limits and prices of OdivonFARM's `PLAN_CATALOG`; the server decides them, not the client. */
export const FARM_PLANS: Record<FarmPlanId, FarmPlan> = {
  trial: { monthlyPrice: 0, yearlyPrice: 0, animalLimit: 250, userLimit: 5, storageLimitMb: 1024 },
  starter: {
    monthlyPrice: 299,
    yearlyPrice: 2990,
    animalLimit: 50,
    userLimit: 2,
    storageLimitMb: 500,
  },
  pro: { monthlyPrice: 699, yearlyPrice: 6990, animalLimit: 250, userLimit: 5, storageLimitMb: 5120 },
  enterprise: {
    monthlyPrice: 1499,
    yearlyPrice: 14990,
    animalLimit: 999999,
    userLimit: 9999,
    storageLimitMb: 25600,
  },
};

export const TRIAL_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

export function addDays(from: Date, days: number): string {
  return new Date(from.getTime() + days * DAY_MS).toISOString();
}

/** The subscription document every new farm starts with: a 14-day full trial. */
export function trialSubscription(tenantId: string, now = new Date()) {
  const trialEndsAt = addDays(now, TRIAL_DAYS);
  const plan = FARM_PLANS.trial;
  return {
    farmId: tenantId,
    planId: 'trial' as FarmPlanId,
    status: 'trialing',
    billingCycle: 'monthly',
    startDate: now.toISOString(),
    currentPeriodEnd: trialEndsAt,
    trialEndsAt,
    animalLimit: plan.animalLimit,
    userLimit: plan.userLimit,
    storageLimitMb: plan.storageLimitMb,
    pricePaid: 0,
    paymentMethod: 'manual',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}
