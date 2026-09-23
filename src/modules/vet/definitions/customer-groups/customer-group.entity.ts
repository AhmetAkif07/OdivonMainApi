import { DefinitionDocument } from '../shared/definition.repository';

export interface CustomerGroup extends DefinitionDocument {
  code: string | null;
}
