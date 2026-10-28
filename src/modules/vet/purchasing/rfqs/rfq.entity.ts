import { BaseDocument } from '../../../../shared/firestore/base-document';

export const RFQ_STATUSES = [
  'draft',
  'collecting',
  'evaluation',
  'pending_approval',
  'approved',
  'awarded',
  'cancelled',
] as const;
export type RfqStatus = (typeof RFQ_STATUSES)[number];

export interface RfqItem {
  productId: string;
  productName: string;
  productCode?: string | null;
  requestedQuantity: number;
  unit: string;
  targetUnitPrice?: number | null;
}

export interface RfqBidLine {
  productId: string;
  productName: string;
  offeredQuantity: number;
  unitPrice: number;
  discountPercent: number;
  taxRatio: number;
  lineTotal: number;
  notes?: string | null;
}

export interface RfqScoreBreakdown {
  priceScore: number;
  deliveryScore: number;
  paymentTermScore: number;
  supplierRatingScore: number;
  totalWeightedScore: number;
}

export interface RfqSupplierBid {
  id: string;
  supplierId: string;
  supplierName: string;
  bidDate: string;
  deliveryDays: number;
  paymentTermDays: number;
  validityDays: number;
  shippingIncluded: boolean;
  lines: RfqBidLine[];
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  grandTotal: number;
  scoreBreakdown?: RfqScoreBreakdown;
  notes?: string | null;
  isWinner: boolean;
  awardReason?: string | null;
}

export interface Rfq extends BaseDocument {
  rfqNo: string;
  title: string;
  demandId?: string | null;
  demandDocumentNo?: string | null;
  date: string;
  deadlineDate: string;
  status: RfqStatus;
  items: RfqItem[];
  bids: RfqSupplierBid[];
  awardedBidId?: string | null;
  awardedSupplierName?: string | null;
  awardReason?: string | null;
  awardedAt?: string | null;
  approvalRequestId?: string | null;
  purchaseOrderId?: string | null;
  evaluationNotes?: string | null;
}
