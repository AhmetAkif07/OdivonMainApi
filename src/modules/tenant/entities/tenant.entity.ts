import { ProductModule } from '../../../shared/authorization/constants';
import { BaseDocument } from '../../../shared/firestore/base-document';

export interface TenantDocument extends BaseDocument {
  name: string;
  ownerUid: string;
  modules: ProductModule[];
  status: 'active' | 'inactive';
}
