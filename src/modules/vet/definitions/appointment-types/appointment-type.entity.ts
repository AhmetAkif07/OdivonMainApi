import { DefinitionDocument } from '../shared/definition.repository';

export interface AppointmentType extends DefinitionDocument {
  remark: string | null;
  price: number;
  color: string | null;
  taxId: string | null;
  isDefaultPrice: boolean;
}

export interface AppointmentTypeListItem extends AppointmentType {
  taxName: string;
}
