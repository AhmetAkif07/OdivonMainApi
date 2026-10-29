import { BaseDocument } from '../../../../shared/firestore/base-document';

export const STOCK_COUNT_STATUSES = ['draft', 'applied'] as const;
export type StockCountStatus = (typeof STOCK_COUNT_STATUSES)[number];

export interface StockCountLine {
  productId: string;
  /** On-hand when the count sheet was created; refreshed when the count is applied. */
  systemQuantity: number;
  /** Null until someone counts the item; uncounted lines are left untouched on apply. */
  countedQuantity: number | null;
  difference: number | null;
}

export interface StockCount extends BaseDocument {
  storeId: string;
  date: string;
  status: StockCountStatus;
  remark: string | null;
  lines: StockCountLine[];
  appliedAt: string | null;
  appliedBy: string | null;
}

export interface StockCountLineView extends StockCountLine {
  productName: string;
}

export interface StockCountView extends Omit<StockCount, 'lines'> {
  storeName: string;
  lines: StockCountLineView[];
  countedLines: number;
  totalLines: number;
}
