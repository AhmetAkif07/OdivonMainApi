import { FirebaseAuthGuard } from '../../../shared/auth/firebase-auth.guard';
import { ModuleGuard } from '../../../shared/authorization/module.guard';
import { PermissionGuard } from '../../../shared/authorization/permission.guard';
import { SubscriptionGuard } from '../../../shared/authorization/subscription.guard';
import { TenantGuard } from '../../../shared/tenancy/tenant.guard';

/**
 * Salon data routes. `SubscriptionGuard` closes them (SUBSCRIPTION_REQUIRED) once the trial or the
 * paid period plus grace days is over; the subscription screen and support stay reachable.
 */
export const HairGuards = [FirebaseAuthGuard, TenantGuard, ModuleGuard, PermissionGuard, SubscriptionGuard] as const;

/** `/hair/me`, settings and branches: the panel must still sign in and show an expired salon. */
export const HairOpenGuards = [FirebaseAuthGuard, TenantGuard, ModuleGuard, PermissionGuard] as const;
