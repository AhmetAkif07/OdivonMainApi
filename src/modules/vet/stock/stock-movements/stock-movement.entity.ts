import { BaseDocument } from '../../../../shared/firestore/base-document';

export const STOCK_DIRECTIONS = ['in', 'out'] as const;
export type StockDirection = (typeof STOCK_DIRECTIONS)[number];

export const STOCK_REASONS = [
  'purchase',
  'sale',
  'transfer',
  'adjustment',
  'internal',
  'damaged',
  'expired',
  'loss',
  'vaccine',
  'demand',
] as const;
export type StockReason = (typeof STOCK_REASONS)[number];

export const STOCK_SOURCES = ['manual', 'sale', 'purchase', 'vaccine', 'demand'] as const;
export type StockSourceType = (typeof STOCK_SOURCES)[number];

export interface StockSource {
  type: StockSourceType;
  id: string;
}

export interface StockMovement extends BaseDocument {
  date: string;
  productId: string;
  storeId: string;
  direction: StockDirection;
  reason: StockReason;
  quantity: number;
  unitPrice: number | null;
  remark: string | null;
  source: StockSource;
}

export interface StockMovementListItem extends StockMovement {
  productName: string;
  storeName: string;
}

export interface StockBalance {
  id: string;
  createdAt: string;
  productId: string;
  productName: string;
  storeId: string;
  storeName: string;
  onHand: number;
  criticalAmount: number | null;
  low: boolean;
}
