import { DefinitionDocument } from '../shared/definition.repository';

export const TAX_TYPES = ['sale', 'purchase', 'both'] as const;
export type TaxType = (typeof TAX_TYPES)[number];

export interface Tax extends DefinitionDocument {
  ratio: number;
  type: TaxType;
}
