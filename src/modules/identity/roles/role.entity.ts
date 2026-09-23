import { PermissionMap } from '../../../shared/authorization/permissions';
import { BaseDocument } from '../../../shared/firestore/base-document';

export interface Role extends BaseDocument {
  name: string;
  description: string | null;
  permissions: PermissionMap;
}
