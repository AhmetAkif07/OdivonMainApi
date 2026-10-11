import { BaseDocument } from '../../../../shared/firestore/base-document';

export const PO_STATUSES = [
  'draft',
  'pending_approval',
  'approved',
  'ordered',
  'partially_received',
  'received',
  'cancelled',
] as const;
export type PurchaseOrderStatus = (typeof PO_STATUSES)[number];

export interface PurchaseOrderLine {
  productId: string;
  productName: string;
  orderedQuantity: number;
  receivedQuantity: number;
  unitPrice: number;
  discountPercent: number;
  taxRatio: number;
  netAmount: number;
  totalAmount: number;
}

export interface GoodsReceiptLog {
  id: string;
  receiptDate: string;
  invoiceNo?: string | null;
  storeId: string;
  storeName?: string | null;
  receivedByUserName: string;
  receivedLines: Array<{
    productId: string;
    productName: string;
    quantity: number;
    batchNo?: string | null;
    expirationDate?: string | null;
  }>;
  notes?: string | null;
}

export interface PurchaseOrder extends BaseDocument {
  orderNo: string;
  supplierId: string;
  supplierName: string;
  rfqId?: string | null;
  demandId?: string | null;
  orderDate: string;
  expectedDeliveryDate: string;
  paymentTerm?: string | null;
  paymentMethodId?: string | null;
  status: PurchaseOrderStatus;
  lines: PurchaseOrderLine[];
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  grandTotal: number;
  approvalRequestId?: string | null;
  notes?: string | null;
  receiptHistory: GoodsReceiptLog[];
}
