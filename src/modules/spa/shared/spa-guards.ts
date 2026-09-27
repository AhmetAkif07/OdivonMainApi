import { FirebaseAuthGuard } from '../../../shared/auth/firebase-auth.guard';
import { ModuleGuard } from '../../../shared/authorization/module.guard';
import { PermissionGuard } from '../../../shared/authorization/permission.guard';
import { TenantGuard } from '../../../shared/tenancy/tenant.guard';

export const SpaGuards = [FirebaseAuthGuard, TenantGuard, ModuleGuard, PermissionGuard] as const;
