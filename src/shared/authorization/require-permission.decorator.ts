import { SetMetadata } from '@nestjs/common';
import { PermissionAction, PermissionResource } from './permissions';

export const PERMISSION_KEY = 'requiredPermission';

export interface RequiredPermission {
  resource: PermissionResource;
  action: PermissionAction;
}

export const RequirePermission = (resource: PermissionResource, action: PermissionAction) =>
  SetMetadata(PERMISSION_KEY, { resource, action } satisfies RequiredPermission);
