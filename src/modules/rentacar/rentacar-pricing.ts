import { AppException } from '../../shared/errors/app.exception';
import { ErrorCode } from '../../shared/errors/error-codes';
import { PriceSnapshot, PriceTier } from './rentacar.types';

const DAY_MS = 86_400_000;

export interface QuoteInput {
  pickupAt: string;
  returnAt: string;
  ratePlanId: string;
  tiers: PriceTier[];
  taxRate: number;
  extrasAmount?: number;
  oneWayFee?: number;
  discountPercent?: number;
  now?: Date;
}

export function calculateQuote(input: QuoteInput): PriceSnapshot {
  const start = Date.parse(input.pickupAt);
  const end = Date.parse(input.returnAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    throw new AppException(ErrorCode.RENT_INVALID, 'İade zamanı alış zamanından sonra olmalıdır.');
  }
  const rentalDays = Math.max(1, Math.ceil((end - start) / DAY_MS));
  const tier = [...input.tiers]
    .sort((a, b) => a.minDays - b.minDays)
    .find((row) => rentalDays >= row.minDays && (row.maxDays === null || rentalDays <= row.maxDays));
  if (!tier || tier.dailyPrice < 0) {
    throw new AppException(ErrorCode.RENT_INVALID, 'Bu süre için geçerli tarife bulunamadı.');
  }
  const baseAmount = money(rentalDays * tier.dailyPrice);
  const extrasAmount = money(Math.max(0, input.extrasAmount ?? 0));
  const oneWayFee = money(Math.max(0, input.oneWayFee ?? 0));
  const gross = baseAmount + extrasAmount + oneWayFee;
  const discountPercent = Math.min(100, Math.max(0, input.discountPercent ?? 0));
  const discountAmount = money(gross * discountPercent / 100);
  const netAmount = money(gross - discountAmount);
  const taxRate = Math.min(100, Math.max(0, input.taxRate));
  const taxAmount = money(netAmount * taxRate / 100);
  return {
    currency: 'TRY', rentalDays, baseAmount, extrasAmount, oneWayFee, discountAmount,
    netAmount, taxRate, taxAmount, totalAmount: money(netAmount + taxAmount),
    ratePlanId: input.ratePlanId, calculatedAt: (input.now ?? new Date()).toISOString(),
  };
}

function money(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
