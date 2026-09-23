import { DefinitionDocument } from '../shared/definition.repository';

export const PRODUCT_TYPES = ['product', 'service', 'vaccine'] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];

export interface Product extends DefinitionDocument {
  productType: ProductType;
  code: string | null;
  barcode: string | null;
  categoryId: string | null;
  unitId: string | null;
  taxId: string | null;
  supplierId: string | null;
  storeId: string | null;
  buyingPrice: number;
  sellingPrice: number;
  vatIncluded: boolean;
  criticalAmount: number | null;
  animalType: string | null;
  active: boolean;
}

export interface ProductListItem extends Product {
  categoryName: string;
  unitName: string;
  taxRatio: number | null;
  supplierName: string;
  storeName: string;
}
