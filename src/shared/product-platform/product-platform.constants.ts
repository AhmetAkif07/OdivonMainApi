import { ProductModule } from '../authorization/constants';

export const ODIVON_PRODUCT_ROUTES = {
  fgas: 'fgas',
  machineCe: 'machine-ce',
  foodLabel: 'food-label',
  productSafe: 'product-safe',
  fireSafe: 'fire-safe',
  payFair: 'pay-fair',
  cargoDocs: 'cargo-docs',
  kids: 'kids',
  cyberReady: 'cyber-ready',
  diet: 'diet',
} as const satisfies Record<string, ProductModule>;

export const WAVE_ONE_PRODUCTS = ['fgas', 'fire-safe', 'food-label'] as const satisfies readonly ProductModule[];

export const PRODUCT_AUDIT_EVENTS = {
  created: 'record.created',
  updated: 'record.updated',
  archived: 'record.archived',
  restored: 'record.restored',
  snapshotCreated: 'snapshot.created',
} as const;
