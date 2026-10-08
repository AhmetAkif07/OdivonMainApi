import { HttpException, HttpStatus } from '@nestjs/common';

/** APM subscription packages. `monthlyAppointments: null` means unlimited. Prices are TL per month. */
export const APM_PLANS = {
  apm_limited: { name: 'Sınırlı', monthlyPrice: 39.99, monthlyAppointments: 20 },
  apm_premium: { name: 'Premium', monthlyPrice: 59.99, monthlyAppointments: null },
} as const;

export type ApmPlanId = keyof typeof APM_PLANS;

export function isApmPlan(planId: unknown): planId is ApmPlanId {
  return typeof planId === 'string' && planId in APM_PLANS;
}

/** First instant of the current calendar month in Türkiye (UTC+3, no DST), as UTC ISO. */
export function istanbulMonthStart(now = new Date()): string {
  const [year, month] = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit' })
    .format(now)
    .split('-');
  return new Date(`${year}-${month}-01T00:00:00+03:00`).toISOString();
}

/** 402: the trial or subscription has ended, so new appointments need a paid package. */
export class ApmSubscriptionRequiredException extends HttpException {
  constructor() {
    super('Deneme süreniz veya aboneliğiniz sona erdi. Yeni randevu eklemek için bir paket seçin.', HttpStatus.PAYMENT_REQUIRED);
  }
}

/** 403: the monthly appointment quota of the package is used up. */
export class ApmPlanLimitException extends HttpException {
  constructor(limit: number) {
    super(`Bu ay paketinizin ${limit} randevu hakkı doldu. Sınırsız randevu için Premium pakete geçebilirsiniz.`, HttpStatus.FORBIDDEN);
  }
}
