import { BaseDocument } from '../../../../shared/firestore/base-document';

export const SALE_TYPES = ['sale', 'purchase'] as const;
export type SaleType = (typeof SALE_TYPES)[number];

export interface SaleLine {
  productId: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  taxId: string | null;
  taxRatio: number;
  vatIncluded: boolean;
}

export interface Sale extends BaseDocument {
  type: SaleType;
  date: string;
  customerId: string | null;
  supplierId: string | null;
  invoiceNo: string | null;
  paymentMethodId: string | null;
  cashRegisterId: string | null;
  discount: number;
  remark: string | null;
  lines: SaleLine[];
  net: number;
  vat: number;
  total: number;
}

export interface SaleListItem extends Sale {
  partyName: string;
  paymentMethodName: string;
  cashRegisterName: string;
}
