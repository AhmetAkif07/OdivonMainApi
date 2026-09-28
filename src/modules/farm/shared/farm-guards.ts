import { FirebaseAuthGuard } from '../../../shared/auth/firebase-auth.guard';
import { ModuleGuard } from '../../../shared/authorization/module.guard';
import { TenantGuard } from '../../../shared/tenancy/tenant.guard';

/** Farm authorization is the member's farm role (`FarmStore.currentRole`), checked in services. */
export const FarmGuards = [FirebaseAuthGuard, TenantGuard, ModuleGuard] as const;
