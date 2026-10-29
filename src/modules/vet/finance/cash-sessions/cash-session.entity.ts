import { BaseDocument } from '../../../../shared/firestore/base-document';

export const CASH_SESSION_STATUSES = ['open', 'closed'] as const;
export type CashSessionStatus = (typeof CASH_SESSION_STATUSES)[number];

export interface PaymentMethodTotal {
  paymentMethodId: string | null;
  paymentMethodName: string;
  incoming: number;
  outgoing: number;
  /** False for open-account (veresiye) methods: they do not move cash through the till. */
  countsAsCash: boolean;
}

export interface CashSessionSummary {
  openingAmount: number;
  salesIn: number;
  purchasesOut: number;
  collectionsIn: number;
  paymentsOut: number;
  movementsIn: number;
  movementsOut: number;
  /** Sales recorded on an open-account method; shown for reference, not part of expected cash. */
  creditSales: number;
  expectedAmount: number;
  saleCount: number;
  byPaymentMethod: PaymentMethodTotal[];
}

export interface CashSession extends BaseDocument {
  cashRegisterId: string;
  status: CashSessionStatus;
  openedAt: string;
  openedBy: string;
  openingAmount: number;
  openingRemark: string | null;
  closedAt: string | null;
  closedBy: string | null;
  countedAmount: number | null;
  difference: number | null;
  closingRemark: string | null;
  /** Frozen at close time so the Z report does not change if records are edited later. */
  summary: CashSessionSummary | null;
}

export interface CashSessionListItem extends CashSession {
  cashRegisterName: string;
}
