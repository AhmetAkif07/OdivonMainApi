import { BaseDocument } from '../../../../shared/firestore/base-document';

export interface Customer extends BaseDocument {
  firstName: string;
  lastName: string;
  phone: string;
  email: string | null;
  address: string | null;
  note: string | null;
  discountRate: number;
  isArchive: boolean;
}
