import { DefinitionDocument } from '../shared/definition.repository';

export interface ProductCategory extends DefinitionDocument {
  code: string | null;
}
