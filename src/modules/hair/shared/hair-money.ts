import { hairInvalid } from './hair-errors';

export type PaymentMethod = 'cash' | 'creditCard' | 'debitCard' | 'bankTransfer' | 'other';

export const PAYMENT_METHODS: readonly PaymentMethod[] = [
  'cash',
  'creditCard',
  'debitCard',
  'bankTransfer',
  'other',
];

/** Upper bound for a single line's quantity — guards against typos like 1000 instead of 1. */
export const MAX_LINE_QTY = 999;

export interface PaymentLine {
  method: PaymentMethod;
  amount: number;
  reference?: string;
}

export function isPositiveInt(value: unknown, max = Number.MAX_SAFE_INTEGER): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= max;
}

/** A finite, non-negative money amount with at most two decimals (kuruş). */
export function isMoney(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    Math.abs(Math.round(value * 100) - value * 100) < 1e-6
  );
}

export function isPaymentMethod(value: unknown): value is PaymentMethod {
  return typeof value === 'string' && (PAYMENT_METHODS as readonly string[]).includes(value);
}

/** Each payment line must have a known method and a strictly positive amount. */
export function assertPayments(payments: unknown, { allowEmpty = false } = {}): PaymentLine[] {
  if (!Array.isArray(payments) || (!allowEmpty && payments.length === 0)) {
    throw hairInvalid('En az bir ödeme satırı zorunludur.');
  }
  return payments.map((p: { method?: unknown; amount?: unknown; reference?: unknown }) => {
    if (!isPaymentMethod(p?.method)) {
      throw hairInvalid('Geçersiz ödeme yöntemi.');
    }
    if (!isMoney(p.amount) || p.amount <= 0) {
      throw hairInvalid('Ödeme tutarları sıfırdan büyük olmalıdır.');
    }
    return {
      method: p.method,
      amount: p.amount,
      ...(typeof p.reference === 'string' && p.reference ? { reference: p.reference } : {}),
    };
  });
}

const DATE_ID = /^\d{4}-\d{2}-\d{2}$/;

/** `YYYY-MM-DD` that is also a real calendar date (rejects 2026-02-30). */
export function isDateId(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_ID.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** KDV: price is VAT-inclusive (V-001). Returns the VAT part of a gross amount. */
export function extractVat(gross: number, ratePercent: number): number {
  if (!(ratePercent > 0)) return 0;
  return round2(gross - gross / (1 + ratePercent / 100));
}

export function addVat(net: number, ratePercent: number): number {
  return round2(net * (1 + Math.max(0, ratePercent) / 100));
}
