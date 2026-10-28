import { FirebaseAuthGuard } from '../../../shared/auth/firebase-auth.guard';
import { ModuleGuard } from '../../../shared/authorization/module.guard';
import { TenantGuard } from '../../../shared/tenancy/tenant.guard';

export const BeautyGuards = [FirebaseAuthGuard, TenantGuard, ModuleGuard] as const;
