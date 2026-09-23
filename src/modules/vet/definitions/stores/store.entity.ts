import { DefinitionDocument } from '../shared/definition.repository';

export interface Store extends DefinitionDocument {
  code: string | null;
  active: boolean;
}
