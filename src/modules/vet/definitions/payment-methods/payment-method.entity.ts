import { DefinitionDocument } from '../shared/definition.repository';

export interface PaymentMethod extends DefinitionDocument {
  remark: string | null;
}
