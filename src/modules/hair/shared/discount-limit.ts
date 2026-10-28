import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { HairStaffRole } from './hair-roles';

/** Highest discount (% of the line / basket) a role may give at checkout; admins are never limited. */
export type MaxDiscountPercent = Record<Exclude<HairStaffRole, 'admin'>, number>;

export const DEFAULT_MAX_DISCOUNT_PERCENT: MaxDiscountPercent = {
  manager: 30,
  receptionist: 10,
  cashier: 10,
  stylist: 0,
};

export function discountLimitFor(role: HairStaffRole, settings: Partial<MaxDiscountPercent> | undefined): number {
  if (role === 'admin') return 100;
  const configured = settings?.[role];
  return typeof configured === 'number' ? configured : DEFAULT_MAX_DISCOUNT_PERCENT[role];
}

/** Rounding slack so a 10% discount typed as an amount (e.g. 33.33 of 333.30) is not rejected. */
const PERCENT_EPSILON = 0.01;

/**
 * 403 DISCOUNT_LIMIT when a line discount (share of quantity × unit price) or the global discount
 * (share of the subtotal after line discounts) exceeds `limitPercent`.
 */
export function assertDiscountLimit(
  items: { name: string; quantity: number; unitPrice: number; discount: number }[],
  subtotal: number,
  globalDiscount: number,
  limitPercent: number,
): void {
  if (limitPercent >= 100) return;
  const reject = (requested: number, target: string) => {
    throw new AppException(
      ErrorCode.DISCOUNT_LIMIT,
      `${target} için en fazla %${limitPercent} indirim yapabilirsiniz.`,
      { maxDiscountPercent: limitPercent, requestedPercent: Math.round(requested * 100) / 100 },
    );
  };
  for (const item of items) {
    const gross = item.quantity * item.unitPrice;
    if (item.discount <= 0) continue;
    const percent = gross > 0 ? (item.discount / gross) * 100 : 100;
    if (percent > limitPercent + PERCENT_EPSILON) reject(percent, `"${item.name}"`);
  }
  if (globalDiscount > 0) {
    const percent = subtotal > 0 ? (globalDiscount / subtotal) * 100 : 100;
    if (percent > limitPercent + PERCENT_EPSILON) reject(percent, 'Sepet');
  }
}
