import { Injectable, Optional } from '@nestjs/common';
import { PRODUCT_MODULES, ProductModule } from '../../shared/authorization/constants';
import { AppException } from '../../shared/errors/app.exception';
import { ErrorCode } from '../../shared/errors/error-codes';
import { FirebaseService } from '../../shared/firebase/firebase.service';
import { ROOT_COLLECTION } from '../../shared/firebase/firestore-path';
import { SAAS_PLAN_MODULE, SAAS_PLAN_NAMES, SAAS_SANDBOX_PRICES } from '../payments/saas-prices';

export type SaasPriceCycle = 'monthly' | 'yearly';
/** `shared` = the common Odivon plan set every product sells; the others are one product's own packages. */
export type SaasPlanModule = 'shared' | 'apm' | 'rentacar';

/** One sellable Odivon subscription plan with its current price (TL). `null` = that cycle is not sold. */
export interface SaasPlanPricing {
  id: string;
  name: string;
  module: SaasPlanModule;
  monthly: number | null;
  yearly: number | null;
  active: boolean;
  /**
   * Where the values come from: `code` (default in code), `default` (panel price for all
   * products) or `product` (panel price for this product only).
   */
  source: 'code' | 'default' | 'product';
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface SaasPricingCatalog {
  currency: 'TRY';
  /** The product these prices are for, or null for the defaults that every product inherits. */
  product: ProductModule | null;
  updatedAt: string | null;
  plans: SaasPlanPricing[];
}

export interface SaasPlanPricePatch {
  name?: string;
  monthly?: number | null;
  yearly?: number | null;
  active?: boolean;
}

interface StoredPlan {
  name?: string;
  monthly?: number | null;
  yearly?: number | null;
  active?: boolean;
  updatedAt?: string;
  updatedBy?: string;
}

interface StoredPricing {
  /** Defaults for every product. */
  plans?: Record<string, StoredPlan>;
  /** Per-product overrides of the shared plans: products[module][planId]. */
  products?: Record<string, Record<string, StoredPlan>>;
  updatedAt?: string;
}

export const SAAS_PRICING_DOC = `${ROOT_COLLECTION.platformSettings}/saasPricing`;
/** Each Worker isolate re-reads the prices at most this often, so a panel change is live within it. */
const CACHE_MS = 30_000;
const MAX_PRICE = 1_000_000;

export const SAAS_PLAN_IDS = Object.keys(SAAS_SANDBOX_PRICES);

export function isProductModule(value: unknown): value is ProductModule {
  return typeof value === 'string' && (PRODUCT_MODULES as readonly string[]).includes(value);
}

/** Plans a product sells: its own packages (APM, Rent a Car) and, except APM, the shared set. */
export function planSoldBy(plan: { module: SaasPlanModule }, product: ProductModule | null): boolean {
  if (!product) return true;
  if (plan.module !== 'shared') return plan.module === product;
  return product !== 'apm';
}

function codePlan(id: string): SaasPlanPricing {
  const prices = (SAAS_SANDBOX_PRICES as Record<string, Partial<Record<SaasPriceCycle, number>>>)[id] ?? {};
  return {
    id,
    name: SAAS_PLAN_NAMES[id] ?? id,
    module: SAAS_PLAN_MODULE[id] ?? 'shared',
    monthly: prices.monthly ?? null,
    yearly: prices.yearly ?? null,
    active: true,
    source: 'code',
    updatedAt: null,
    updatedBy: null,
  };
}

function validPrice(value: unknown): number | null {
  const number = Number(value);
  return value !== null && value !== undefined && Number.isFinite(number) && number > 0 ? Math.round(number * 100) / 100 : null;
}

function applyOverride(base: SaasPlanPricing, override: StoredPlan | undefined, source: 'default' | 'product'): SaasPlanPricing {
  if (!override) return base;
  return {
    ...base,
    name: typeof override.name === 'string' && override.name.trim() ? override.name.trim() : base.name,
    monthly: 'monthly' in override ? validPrice(override.monthly) : base.monthly,
    yearly: 'yearly' in override ? validPrice(override.yearly) : base.yearly,
    active: 'active' in override ? override.active !== false : base.active,
    source,
    updatedAt: override.updatedAt ?? null,
    updatedBy: override.updatedBy ?? null,
  };
}

/**
 * Prices of one product (or the defaults when `product` is null): code defaults, then the panel
 * defaults, then that product's own overrides of the shared plans. Unknown stored ids are ignored.
 */
export function mergeSaasPricing(stored: StoredPricing | undefined, product: ProductModule | null = null): SaasPricingCatalog {
  const defaults = stored?.plans ?? {};
  const productOverrides = (product && stored?.products?.[product]) || {};
  const plans = SAAS_PLAN_IDS.map((id) => applyOverride(codePlan(id), defaults[id], 'default'))
    .filter((plan) => planSoldBy(plan, product))
    .map((plan) => (plan.module === 'shared' ? applyOverride(plan, productOverrides[plan.id], 'product') : plan));
  return { currency: 'TRY', product, updatedAt: stored?.updatedAt ?? null, plans };
}

/** The product a tenant is priced as: the module of a product's own package, else its first module. */
export function pricingProduct(tenantModules: readonly string[] | undefined, planId?: string): ProductModule | null {
  const planModule = planId ? SAAS_PLAN_MODULE[planId] : undefined;
  if (planModule) return planModule;
  const first = tenantModules?.find((module) => module !== 'apm') ?? tenantModules?.[0];
  return isProductModule(first) ? first : null;
}

/**
 * Server-authoritative Odivon SaaS prices, per product. The panel edits them
 * (platform/saas-pricing), the apps read them (payments/saas-plans, public/saas-pricing) and every
 * order is charged with them. A change applies from the next payment on; already paid periods
 * and open orders keep the amount they were created with.
 */
@Injectable()
export class SaasPricingService {
  private cache: { at: number; stored: StoredPricing | undefined } | null = null;

  constructor(@Optional() private readonly firebase?: FirebaseService) {}

  private async stored(fresh = false): Promise<StoredPricing | undefined> {
    if (!this.firebase) return undefined;
    if (!fresh && this.cache && Date.now() - this.cache.at < CACHE_MS) return this.cache.stored;
    const snapshot = await this.firebase.db.doc(SAAS_PRICING_DOC).get();
    const stored = snapshot.exists ? (snapshot.data() as StoredPricing) : undefined;
    this.cache = { at: Date.now(), stored };
    return stored;
  }

  async catalog(product: ProductModule | null = null, fresh = false): Promise<SaasPricingCatalog> {
    return mergeSaasPricing(await this.stored(fresh), product);
  }

  /** Active, priced plans of a product (all plans with the defaults when product is null). */
  async activePlans(product: ProductModule | null = null): Promise<SaasPlanPricing[]> {
    const { plans } = await this.catalog(product);
    return plans.filter((plan) => plan.active && (plan.monthly !== null || plan.yearly !== null));
  }

  /** Price in TL of an active plan and cycle for a product, or undefined when it is not sold. */
  async price(planId: string, cycle: SaasPriceCycle, product: ProductModule | null = null): Promise<number | undefined> {
    const plan = (await this.catalog(product)).plans.find((item) => item.id === planId);
    if (!plan || !plan.active) return undefined;
    return plan[cycle] ?? undefined;
  }

  /** `{ planId: { monthly?, yearly? } }` of a product's active plans: the `payments/saas-plans` shape. */
  async priceMap(product: ProductModule | null = null): Promise<Record<string, Partial<Record<SaasPriceCycle, number>>>> {
    const plans = await this.activePlans(product);
    return Object.fromEntries(
      plans.map((plan) => [
        plan.id,
        {
          ...(plan.monthly !== null ? { monthly: plan.monthly } : {}),
          ...(plan.yearly !== null ? { yearly: plan.yearly } : {}),
        },
      ]),
    );
  }

  /**
   * Saves a panel change. Without `product` it changes the default every product inherits; with
   * one it changes only that product's price of a shared plan. A product's own package (APM,
   * Rent a Car) has a single price, so it is always saved as its default.
   */
  async update(
    planId: string,
    patch: SaasPlanPricePatch,
    actor: string,
    product: ProductModule | null = null,
  ): Promise<{ before: SaasPlanPricing; after: SaasPlanPricing; product: ProductModule | null }> {
    const firebase = this.requireFirebase();
    const target = this.target(planId, product);
    const stored = await this.stored(true);
    const before = mergeSaasPricing(stored, target).plans.find((plan) => plan.id === planId);
    if (!before) throw new AppException(ErrorCode.VALIDATION_ERROR, 'Bu plan bu üründe satılmıyor.');

    for (const cycle of ['monthly', 'yearly'] as const) {
      const value = patch[cycle];
      if (value !== undefined && value !== null && (validPrice(value) === null || Number(value) > MAX_PRICE)) {
        throw new AppException(ErrorCode.VALIDATION_ERROR, `Geçersiz ${cycle === 'monthly' ? 'aylık' : 'yıllık'} fiyat.`);
      }
    }
    const next = {
      name: patch.name !== undefined ? patch.name.trim() || before.name : before.name,
      monthly: patch.monthly !== undefined ? validPrice(patch.monthly) : before.monthly,
      yearly: patch.yearly !== undefined ? validPrice(patch.yearly) : before.yearly,
      active: patch.active ?? before.active,
    };
    if (next.active && next.monthly === null && next.yearly === null) {
      throw new AppException(ErrorCode.VALIDATION_ERROR, 'Aktif bir planın en az bir fiyatı (aylık veya yıllık) olmalı.');
    }
    const now = new Date().toISOString();
    const entry: StoredPlan = { ...next, updatedAt: now, updatedBy: actor };
    const ref = firebase.db.doc(SAAS_PRICING_DOC);
    if (target && before.module === 'shared') {
      const products = { ...(stored?.products ?? {}) };
      products[target] = { ...(products[target] ?? {}), [planId]: entry };
      await ref.set({ products, updatedAt: now }, { mergeFields: ['products', 'updatedAt'] });
    } else {
      await ref.set({ plans: { [planId]: entry }, updatedAt: now }, { merge: true });
    }
    const after = (await this.catalog(target, true)).plans.find((plan) => plan.id === planId)!;
    return { before, after, product: target };
  }

  /** Drops a product's own price of a shared plan, so it inherits the default again. */
  async resetProductPrice(planId: string, product: ProductModule): Promise<{ before: SaasPlanPricing; after: SaasPlanPricing }> {
    const firebase = this.requireFirebase();
    this.target(planId, product);
    const stored = await this.stored(true);
    const before = mergeSaasPricing(stored, product).plans.find((plan) => plan.id === planId);
    if (!before || before.module !== 'shared') {
      throw new AppException(ErrorCode.VALIDATION_ERROR, 'Bu plan için ürüne özel fiyat yok.');
    }
    const products = { ...(stored?.products ?? {}) };
    const own = { ...(products[product] ?? {}) };
    delete own[planId];
    products[product] = own;
    const now = new Date().toISOString();
    await firebase.db.doc(SAAS_PRICING_DOC).set({ products, updatedAt: now }, { mergeFields: ['products', 'updatedAt'] });
    const after = (await this.catalog(product, true)).plans.find((plan) => plan.id === planId)!;
    return { before, after };
  }

  private target(planId: string, product: ProductModule | null): ProductModule | null {
    if (!SAAS_PLAN_IDS.includes(planId)) throw new AppException(ErrorCode.VALIDATION_ERROR, `Bilinmeyen plan: ${planId}`);
    if (product !== null && !isProductModule(product)) {
      throw new AppException(ErrorCode.VALIDATION_ERROR, `Bilinmeyen ürün: ${String(product)}`);
    }
    const planModule = SAAS_PLAN_MODULE[planId];
    if (planModule && product && planModule !== product) {
      throw new AppException(ErrorCode.VALIDATION_ERROR, 'Bu paket bu üründe satılmıyor.');
    }
    return product;
  }

  private requireFirebase(): FirebaseService {
    if (!this.firebase) throw new Error('SaasPricingService needs Firestore to save prices');
    this.cache = null;
    return this.firebase;
  }
}

/** Code-default prices, for code paths built without Nest DI (unit tests). */
export const STATIC_SAAS_PRICING = new SaasPricingService();
