import { DefinitionDocument } from '../shared/definition.repository';

export interface Unit extends DefinitionDocument {
  code: string | null;
}
