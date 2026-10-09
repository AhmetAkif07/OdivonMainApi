import { BaseDocument } from '../../../shared/firestore/base-document';

export interface VetBranch extends BaseDocument {
  name: string;
  code: string;
  isMain: boolean;
  phone: string;
  email: string | null;
  address: string;
  city: string;
  district: string | null;
  managerName: string | null;
  color: string | null;
  status: 'active' | 'inactive';
}
