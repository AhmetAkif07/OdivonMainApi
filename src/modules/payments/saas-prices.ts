import { FARM_PLANS } from '../farm/shared/farm-plans';
// Production defaults. Product-specific prices can still be overridden from the platform panel.
export const SAAS_SANDBOX_PRICES = {
  starter: { monthly: 1490, yearly: 14900 },
  pro: { monthly: 2990, yearly: 29900 },
  enterprise: { monthly: 5990, yearly: 59900 },
  // Odivon APM packages (see modules/apm/apm-plans.ts); monthly only, real prices in TL.
  apm_limited: { monthly: 39.99 },
  apm_premium: { monthly: 59.99 },
  rent_starter: { monthly: 990, yearly: 9900 },
  rent_business: { monthly: 2990, yearly: 29900 },
  rent_professional: { monthly: 5990, yearly: 59900 },
} as const;

/**
 * A product's own code prices for the shared plans (TL). They replace the shared defaults for that
 * product; a price set for the product in the platform panel still wins. Farm sells the shared
 * plan ids at the prices of its own catalog (modules/farm/shared/farm-plans.ts).
 */
export const SAAS_PRODUCT_PRICES: Record<string, Record<string, { monthly: number; yearly: number }>> = {
  farm: {
    starter: { monthly: FARM_PLANS.starter.monthlyPrice, yearly: FARM_PLANS.starter.yearlyPrice },
    pro: { monthly: FARM_PLANS.pro.monthlyPrice, yearly: FARM_PLANS.pro.yearlyPrice },
    enterprise: { monthly: FARM_PLANS.enterprise.monthlyPrice, yearly: FARM_PLANS.enterprise.yearlyPrice },
  },
};

/** Default display names; the platform panel can rename a plan (see modules/saas-pricing). */
export const SAAS_PLAN_NAMES: Record<string, string> = {
  starter: 'Başlangıç',
  pro: 'Profesyonel',
  enterprise: 'Kurumsal',
  apm_limited: 'Sınırlı',
  apm_premium: 'Premium',
  rent_starter: 'Başlangıç',
  rent_business: 'İşletme',
  rent_professional: 'Profesyonel',
};

type SaasPlanPrices = Record<string, Partial<Record<'monthly' | 'yearly', number>>>;

/**
 * Code defaults only. The live price is SaasPricingService.price(), which applies the overrides
 * saved from the platform panel (Firestore platformSettings/saasPricing).
 */
export function saasPlanPrice(
  planId: string,
  billingCycle: 'monthly' | 'yearly',
): number | undefined {
  return (SAAS_SANDBOX_PRICES as SaasPlanPrices)[planId]?.[billingCycle];
}

/** Packages that belong to one product module; every other plan is the shared Odivon plan set. */
export const SAAS_PLAN_MODULE: Record<string, 'apm' | 'rentacar'> = {
  apm_limited: 'apm',
  apm_premium: 'apm',
  rent_starter: 'rentacar',
  rent_business: 'rentacar',
  rent_professional: 'rentacar',
};
