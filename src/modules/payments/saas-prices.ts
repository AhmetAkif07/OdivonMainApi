// TEST: every plan costs 1 TL so a real card payment can be tried end to end.
// Restore before launch: starter 1490/14900, pro 2990/29900, enterprise 5990/59900.
export const SAAS_SANDBOX_PRICES = {
  starter: { monthly: 1, yearly: 1 },
  pro: { monthly: 1, yearly: 1 },
  enterprise: { monthly: 1, yearly: 1 },
  // Odivon APM packages (see modules/apm/apm-plans.ts); monthly only, real prices in TL.
  apm_limited: { monthly: 39.99 },
  apm_premium: { monthly: 59.99 },
} as const;

type SaasPlanPrices = Record<string, Partial<Record<'monthly' | 'yearly', number>>>;

/** Price in TL of a plan and cycle, or undefined when that combination is not sold. */
export function saasPlanPrice(planId: string, billingCycle: 'monthly' | 'yearly'): number | undefined {
  return (SAAS_SANDBOX_PRICES as SaasPlanPrices)[planId]?.[billingCycle];
}

/** Packages that belong to one product module; every other plan is the shared Odivon plan set. */
export const SAAS_PLAN_MODULE: Record<string, 'apm'> = { apm_limited: 'apm', apm_premium: 'apm' };
