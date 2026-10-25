import { Injectable, Optional } from '@nestjs/common';
import { AppException } from '../../shared/errors/app.exception';
import { ErrorCode } from '../../shared/errors/error-codes';
import { FirebaseService } from '../../shared/firebase/firebase.service';
import { ROOT_COLLECTION } from '../../shared/firebase/firestore-path';
import { SAAS_PLAN_MODULE, SAAS_PLAN_NAMES, SAAS_SANDBOX_PRICES } from '../payments/saas-prices';

export type SaasPriceCycle = 'monthly' | 'yearly';
export type SaasPlanModule = 'shared' | 'apm' | 'rentacar';

/** One sellable Odivon subscription plan with its current price (TL). `null` = that cycle is not sold. */
export interface SaasPlanPricing {
  id: string;
  name: string;
  module: SaasPlanModule;
  monthly: number | null;
  yearly: number | null;
  active: boolean;
  /** Whether a panel override exists; false means the code default is in use. */
  customized: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface SaasPricingCatalog {
  currency: 'TRY';
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
  plans?: Record<string, StoredPlan>;
  updatedAt?: string;
}

export const SAAS_PRICING_DOC = `${ROOT_COLLECTION.platformSettings}/saasPricing`;
/** Each Worker isolate re-reads the prices at most this often, so a panel change is live within it. */
const CACHE_MS = 30_000;
const MAX_PRICE = 1_000_000;

export const SAAS_PLAN_IDS = Object.keys(SAAS_SANDBOX_PRICES);

function defaultPlan(id: string): SaasPlanPricing {
  const prices = (SAAS_SANDBOX_PRICES as Record<string, Partial<Record<SaasPriceCycle, number>>>)[id] ?? {};
  return {
    id,
    name: SAAS_PLAN_NAMES[id] ?? id,
    module: SAAS_PLAN_MODULE[id] ?? 'shared',
    monthly: prices.monthly ?? null,
    yearly: prices.yearly ?? null,
    active: true,
    customized: false,
    updatedAt: null,
    updatedBy: null,
  };
}

function validPrice(value: unknown): number | null {
  const number = Number(value);
  return value !== null && value !== undefined && Number.isFinite(number) && number > 0 ? Math.round(number * 100) / 100 : null;
}

/** Code defaults with the stored overrides applied. Unknown stored plan ids are ignored. */
export function mergeSaasPricing(stored: StoredPricing | undefined): SaasPricingCatalog {
  const overrides = stored?.plans ?? {};
  const plans = SAAS_PLAN_IDS.map((id) => {
    const base = defaultPlan(id);
    const override = overrides[id];
    if (!override) return base;
    return {
      ...base,
      name: typeof override.name === 'string' && override.name.trim() ? override.name.trim() : base.name,
      monthly: 'monthly' in override ? validPrice(override.monthly) : base.monthly,
      yearly: 'yearly' in override ? validPrice(override.yearly) : base.yearly,
      active: override.active !== false,
      customized: true,
      updatedAt: override.updatedAt ?? null,
      updatedBy: override.updatedBy ?? null,
    };
  });
  return { currency: 'TRY', updatedAt: stored?.updatedAt ?? null, plans };
}

/**
 * Server-authoritative Odivon SaaS prices. The panel edits them (platform/saas-pricing), the
 * apps read them (payments/saas-plans, public/saas-pricing) and every order is charged with them.
 * A price change applies from the next payment on; already paid periods and open orders keep
 * the amount they were created with.
 */
@Injectable()
export class SaasPricingService {
  private cache: { at: number; catalog: SaasPricingCatalog } | null = null;

  constructor(@Optional() private readonly firebase?: FirebaseService) {}

  async catalog(fresh = false): Promise<SaasPricingCatalog> {
    if (!this.firebase) return mergeSaasPricing(undefined);
    if (!fresh && this.cache && Date.now() - this.cache.at < CACHE_MS) return this.cache.catalog;
    const snapshot = await this.firebase.db.doc(SAAS_PRICING_DOC).get();
    const catalog = mergeSaasPricing(snapshot.exists ? (snapshot.data() as StoredPricing) : undefined);
    this.cache = { at: Date.now(), catalog };
    return catalog;
  }

  /** Active plans only, optionally of one product module (`shared` = the common Odivon plan set). */
  async activePlans(module?: string): Promise<SaasPlanPricing[]> {
    const { plans } = await this.catalog();
    return plans.filter((plan) => plan.active && (plan.monthly !== null || plan.yearly !== null) && (!module || plan.module === module));
  }

  /** Price in TL of an active plan and cycle, or undefined when that combination is not sold. */
  async price(planId: string, cycle: SaasPriceCycle): Promise<number | undefined> {
    const plan = (await this.catalog()).plans.find((item) => item.id === planId);
    if (!plan || !plan.active) return undefined;
    return plan[cycle] ?? undefined;
  }

  /** `{ planId: { monthly?, yearly? } }` of the active plans: the legacy `payments/saas-plans` shape. */
  async priceMap(): Promise<Record<string, Partial<Record<SaasPriceCycle, number>>>> {
    const plans = await this.activePlans();
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

  /** Saves a panel change for one plan and returns the plan before and after it. */
  async update(planId: string, patch: SaasPlanPricePatch, actor: string): Promise<{ before: SaasPlanPricing; after: SaasPlanPricing }> {
    if (!this.firebase) throw new Error('SaasPricingService.update needs Firestore');
    if (!SAAS_PLAN_IDS.includes(planId)) {
      throw new AppException(ErrorCode.VALIDATION_ERROR, `Bilinmeyen plan: ${planId}`);
    }
    const before = (await this.catalog(true)).plans.find((plan) => plan.id === planId)!;
    const next: SaasPlanPricing = {
      ...before,
      ...(patch.name !== undefined ? { name: patch.name.trim() || before.name } : {}),
      ...(patch.monthly !== undefined ? { monthly: patch.monthly === null ? null : validPrice(patch.monthly) } : {}),
      ...(patch.yearly !== undefined ? { yearly: patch.yearly === null ? null : validPrice(patch.yearly) } : {}),
      ...(patch.active !== undefined ? { active: patch.active } : {}),
    };
    for (const cycle of ['monthly', 'yearly'] as const) {
      const value = patch[cycle];
      if (value !== undefined && value !== null && (validPrice(value) === null || Number(value) > MAX_PRICE)) {
        throw new AppException(ErrorCode.VALIDATION_ERROR, `Geçersiz ${cycle === 'monthly' ? 'aylık' : 'yıllık'} fiyat.`);
      }
    }
    if (next.active && next.monthly === null && next.yearly === null) {
      throw new AppException(ErrorCode.VALIDATION_ERROR, 'Aktif bir planın en az bir fiyatı (aylık veya yıllık) olmalı.');
    }
    const now = new Date().toISOString();
    const stored: StoredPlan = {
      name: next.name,
      monthly: next.monthly,
      yearly: next.yearly,
      active: next.active,
      updatedAt: now,
      updatedBy: actor,
    };
    await this.firebase.db.doc(SAAS_PRICING_DOC).set({ plans: { [planId]: stored }, updatedAt: now }, { merge: true });
    this.cache = null;
    const after = (await this.catalog(true)).plans.find((plan) => plan.id === planId)!;
    return { before, after };
  }
}

/** Code-default prices, for code paths built without Nest DI (unit tests). */
export const STATIC_SAAS_PRICING = new SaasPricingService();
