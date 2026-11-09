import { Injectable, Optional } from '@nestjs/common';
import { PRODUCT_MODULES, ProductModule } from '../../../shared/authorization/constants';
import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { FirebaseService } from '../../../shared/firebase/firebase.service';
import { ROOT_COLLECTION } from '../../../shared/firebase/firestore-path';

export type PaymentMode = 'sandbox' | 'live';

export interface StoredProductMode {
  mode: PaymentMode;
  updatedAt: string;
  updatedBy: string;
  reason?: string | null;
}

interface StoredModes {
  products?: Record<string, StoredProductMode>;
  updatedAt?: string;
}

export interface ProductPaymentMode {
  product: ProductModule;
  mode: PaymentMode;
  /** `override`: set for this product in the panel; `default`: follows the PAYTR_MODE variable. */
  source: 'override' | 'default';
  updatedAt: string | null;
  updatedBy: string | null;
  reason: string | null;
}

export const PAYMENT_MODES_DOC = `${ROOT_COLLECTION.platformSettings}/paymentModes`;
/** A panel change reaches every Worker isolate within this time. */
const CACHE_MS = 30_000;

export function resolveProductModes(stored: StoredModes | undefined, defaultMode: PaymentMode): ProductPaymentMode[] {
  return PRODUCT_MODULES.map((product) => {
    const override = stored?.products?.[product];
    const valid = override && (override.mode === 'live' || override.mode === 'sandbox');
    return {
      product,
      mode: valid ? override.mode : defaultMode,
      source: valid ? 'override' : 'default',
      updatedAt: valid ? override.updatedAt ?? null : null,
      updatedBy: valid ? override.updatedBy ?? null : null,
      reason: valid ? override.reason ?? null : null,
    };
  });
}

/**
 * TEST / CANLI mode of the PayTR subscription payments, per product. PayTR uses one merchant
 * account for both; the mode only decides `test_mode` on the iFrame token. A product without its
 * own setting follows PAYTR_MODE. Only live payments activate a subscription (see PaymentsService).
 */
@Injectable()
export class PaymentModesService {
  private cache: { at: number; stored: StoredModes | undefined } | null = null;

  constructor(@Optional() private readonly firebase?: FirebaseService) {}

  private async stored(fresh = false): Promise<StoredModes | undefined> {
    if (!this.firebase) return undefined;
    if (!fresh && this.cache && Date.now() - this.cache.at < CACHE_MS) return this.cache.stored;
    const snapshot = await this.firebase.db.doc(PAYMENT_MODES_DOC).get();
    const stored = snapshot.exists ? (snapshot.data() as StoredModes) : undefined;
    this.cache = { at: Date.now(), stored };
    return stored;
  }

  async list(defaultMode: PaymentMode, fresh = false): Promise<ProductPaymentMode[]> {
    return resolveProductModes(await this.stored(fresh), defaultMode);
  }

  /** The mode a product's next checkout uses; any read error falls back to the safe default. */
  async modeFor(product: ProductModule | null | undefined, defaultMode: PaymentMode): Promise<PaymentMode> {
    if (!product) return defaultMode;
    try {
      return (await this.list(defaultMode)).find((item) => item.product === product)?.mode ?? defaultMode;
    } catch {
      return defaultMode;
    }
  }

  /** Sets (mode) or removes (null) a product's own mode. Returns the state before and after. */
  async set(product: ProductModule, mode: PaymentMode | null, actor: string, defaultMode: PaymentMode, reason?: string | null) {
    if (!this.firebase) throw new AppException(ErrorCode.INVALID_STATUS, 'Firestore is not available');
    const stored = await this.stored(true);
    const before = resolveProductModes(stored, defaultMode).find((item) => item.product === product)!;
    const products = { ...(stored?.products ?? {}) };
    const at = new Date().toISOString();
    if (mode) products[product] = { mode, updatedAt: at, updatedBy: actor, reason: reason ?? null };
    else delete products[product];
    const next: StoredModes = { ...(stored ?? {}), products, updatedAt: at };
    await this.firebase.db.doc(PAYMENT_MODES_DOC).set(next);
    this.cache = { at: Date.now(), stored: next };
    const after = resolveProductModes(next, defaultMode).find((item) => item.product === product)!;
    return { before, after };
  }
}
