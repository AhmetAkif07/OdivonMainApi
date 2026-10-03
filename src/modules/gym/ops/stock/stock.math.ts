/** Stock at or below this is "low" when a product has no `minStock` of its own (the panel's old rule). */
export const DEFAULT_MIN_STOCK = 5;

export interface StockProduct {
  id: string;
  name?: unknown;
  sku?: unknown;
  stock?: unknown;
  minStock?: unknown;
  reorderQty?: unknown;
  cost?: unknown;
  supplier?: unknown;
  supplierId?: unknown;
  status?: unknown;
}

export interface LowStockItem {
  productId: string;
  name: string;
  sku: string;
  stock: number;
  minStock: number;
  suggestedQty: number;
  unitCost: number;
  supplierId: string | null;
  supplierName: string | null;
}

export interface StockCountLine {
  productId: string;
  productName: string;
  sku: string;
  expected: number;
  counted: number | null;
  difference: number | null;
}

export interface PurchaseOrderLine {
  productId: string;
  productName: string;
  quantity: number;
  unitCost: number;
  total: number;
  receivedQuantity?: number;
}

const num = (value: unknown, fallback = 0): number => {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

export const round2 = (value: number) => Math.round(value * 100) / 100;

export function isActiveProduct(product: StockProduct): boolean {
  return product.status === undefined || product.status === null || product.status === 'active';
}

export function minStockOf(product: StockProduct): number {
  const value = num(product.minStock, Number.NaN);
  return Number.isFinite(value) && value >= 0 ? value : DEFAULT_MIN_STOCK;
}

/**
 * Suggested purchase quantity: the product's usual order size, otherwise enough to reach twice the
 * minimum (at least one).
 */
export function suggestedQty(product: StockProduct): number {
  const reorder = num(product.reorderQty);
  if (reorder > 0) return Math.ceil(reorder);
  return Math.max(1, Math.ceil(minStockOf(product) * 2 - num(product.stock)));
}

/** Active products whose stock is at or below their minimum, most urgent (lowest ratio) first. */
export function lowStockItems(products: StockProduct[], supplierId?: string): LowStockItem[] {
  return products
    .filter(isActiveProduct)
    .filter((product) => num(product.stock) <= minStockOf(product))
    .filter((product) => !supplierId || product.supplierId === supplierId)
    .map((product) => ({
      productId: product.id,
      name: text(product.name) || 'Ürün',
      sku: text(product.sku),
      stock: num(product.stock),
      minStock: minStockOf(product),
      suggestedQty: suggestedQty(product),
      unitCost: num(product.cost),
      supplierId: text(product.supplierId) || null,
      supplierName: text(product.supplier) || null,
    }))
    .sort((left, right) => left.stock - left.minStock - (right.stock - right.minStock) || left.name.localeCompare(right.name, 'tr'));
}

/** Count sheet: the expected stock of every chosen product at the time the count starts. */
export function countSheet(products: StockProduct[], productIds?: string[]): StockCountLine[] {
  const wanted = productIds?.length ? new Set(productIds) : null;
  return products
    .filter((product) => (wanted ? wanted.has(product.id) : isActiveProduct(product)))
    .map((product) => ({
      productId: product.id,
      productName: text(product.name) || 'Ürün',
      sku: text(product.sku),
      expected: num(product.stock),
      counted: null,
      difference: null,
    }))
    .sort((left, right) => left.productName.localeCompare(right.productName, 'tr'));
}

/** Writes counted quantities onto the sheet; products not on the sheet are ignored. */
export function applyCounts(lines: StockCountLine[], counts: { productId: string; counted: number | null }[]): StockCountLine[] {
  const byId = new Map(counts.map((item) => [item.productId, item.counted]));
  return lines.map((line) => {
    if (!byId.has(line.productId)) return line;
    const counted = byId.get(line.productId) ?? null;
    return { ...line, counted, difference: counted === null ? null : counted - line.expected };
  });
}

export function countSummary(lines: StockCountLine[]) {
  const counted = lines.filter((line) => line.counted !== null);
  return {
    totalLines: lines.length,
    countedLines: counted.length,
    shortageUnits: counted.reduce((sum, line) => sum + Math.min(0, line.difference ?? 0), 0),
    surplusUnits: counted.reduce((sum, line) => sum + Math.max(0, line.difference ?? 0), 0),
    mismatchedLines: counted.filter((line) => line.difference !== 0).length,
  };
}

export function orderLines(
  lines: { productId: string; quantity: number; unitCost: number }[],
  products: Map<string, StockProduct>,
): PurchaseOrderLine[] {
  return lines.map((line) => {
    const product = products.get(line.productId);
    return {
      productId: line.productId,
      productName: text(product?.name) || 'Ürün',
      quantity: line.quantity,
      unitCost: round2(line.unitCost),
      total: round2(line.quantity * line.unitCost),
    };
  });
}

export function orderTotal(lines: { quantity: number; unitCost: number }[]): number {
  return round2(lines.reduce((sum, line) => sum + line.quantity * line.unitCost, 0));
}
