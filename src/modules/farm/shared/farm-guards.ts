import { EmailVerifiedGuard } from '../../../shared/auth/email-verified.guard';
import { FirebaseAuthGuard } from '../../../shared/auth/firebase-auth.guard';
import { ModuleGuard } from '../../../shared/authorization/module.guard';
import { TenantGuard } from '../../../shared/tenancy/tenant.guard';

/**
 * Farm authorization is the member's farm role (`FarmStore.currentRole`), checked in services.
 * Owners who signed up but have not opened their verification link get EMAIL_NOT_VERIFIED (403).
 */
export const FarmGuards = [FirebaseAuthGuard, TenantGuard, EmailVerifiedGuard, ModuleGuard] as const;
