import { DefinitionDocument } from '../shared/definition.repository';

export interface CashRegister extends DefinitionDocument {
  active: boolean;
}
