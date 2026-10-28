import { hairInvalid } from './hair-errors';

/** Tenant-defined pick lists (expense / product categories, units, refund reasons). */
export const HAIR_DEFINITION_KINDS = ['expenseCategories', 'productCategories', 'productUnits', 'refundReasons'] as const;
export type HairDefinitionKind = (typeof HAIR_DEFINITION_KINDS)[number];

export type HairDefinitions = Record<HairDefinitionKind, string[]>;

export const HAIR_DEFINITION_MAX_ITEMS = 100;
export const HAIR_DEFINITION_MAX_LENGTH: Record<HairDefinitionKind, number> = {
  expenseCategories: 80,
  productCategories: 80,
  productUnits: 80,
  refundReasons: 120,
};

const LABELS: Record<HairDefinitionKind, string> = {
  expenseCategories: 'Gider kategorileri',
  productCategories: 'Ürün kategorileri',
  productUnits: 'Ürün birimleri',
  refundReasons: 'İade nedenleri',
};

/** Every list present (empty when never saved), so clients can tell the server supports definitions. */
export function mergeDefinitions(...layers: (Partial<HairDefinitions> | undefined)[]): HairDefinitions {
  const merged = {} as HairDefinitions;
  for (const kind of HAIR_DEFINITION_KINDS) {
    const layer = [...layers].reverse().find((l) => Array.isArray(l?.[kind]));
    merged[kind] = layer ? [...(layer[kind] as string[])] : [];
  }
  return merged;
}

/** Trims each item and rejects blank / too long items or oversized lists. Lists left out stay undefined. */
export function normalizeDefinitions(input: Partial<HairDefinitions> | undefined): Partial<HairDefinitions> {
  const normalized: Partial<HairDefinitions> = {};
  for (const kind of HAIR_DEFINITION_KINDS) {
    const list = input?.[kind];
    if (list === undefined || list === null) continue;
    if (!Array.isArray(list)) throw hairInvalid(`${LABELS[kind]} bir liste olmalıdır.`);
    if (list.length > HAIR_DEFINITION_MAX_ITEMS) {
      throw hairInvalid(`${LABELS[kind]} en fazla ${HAIR_DEFINITION_MAX_ITEMS} kayıt içerebilir.`);
    }
    normalized[kind] = list.map((item) => {
      const value = typeof item === 'string' ? item.trim() : '';
      if (!value) throw hairInvalid(`${LABELS[kind]} boş olamaz.`);
      if (value.length > HAIR_DEFINITION_MAX_LENGTH[kind]) {
        throw hairInvalid(`${LABELS[kind]} en fazla ${HAIR_DEFINITION_MAX_LENGTH[kind]} karakter olabilir.`);
      }
      return value;
    });
  }
  return normalized;
}
