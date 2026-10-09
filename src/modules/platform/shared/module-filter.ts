import { ProductModule, PRODUCT_MODULES } from '../../../shared/authorization/constants';

export const DEFAULT_PLATFORM_MODULES: readonly ProductModule[] = ['gym', 'vet', 'farm'];

export function parseModuleFilter(moduleParam?: string | string[]): ProductModule[] {
  if (!moduleParam) {
    return [...DEFAULT_PLATFORM_MODULES];
  }

  const raw = Array.isArray(moduleParam) ? moduleParam.join(',') : moduleParam;
  const parts = raw.split(',').map((p) => p.trim().toLowerCase());

  if (parts.includes('all')) {
    return [...PRODUCT_MODULES];
  }

  const valid = parts.filter((p): p is ProductModule =>
    (PRODUCT_MODULES as readonly string[]).includes(p),
  );

  return valid.length > 0 ? valid : [...DEFAULT_PLATFORM_MODULES];
}
