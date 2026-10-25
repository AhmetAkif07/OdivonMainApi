import { CanActivate, Injectable } from '@nestjs/common';
import { effectiveSubscription, TenantBillingState } from '../../modules/payments/saas-billing';
import { AppException } from '../errors/app.exception';
import { ErrorCode } from '../errors/error-codes';
import { FirebaseService } from '../firebase/firebase.service';
import { TenantContext } from '../tenancy/tenant.context';

/** Prevents expired tenants from using paid product data while billing routes remain reachable. */
@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly tenant: TenantContext,
  ) {}

  async canActivate(): Promise<boolean> {
    const tenantId = this.tenant.getTenantId();
    const snapshot = await this.firebase.db.doc(`tenants/${tenantId}`).get();
    const state = effectiveSubscription((snapshot.data() ?? {}) as TenantBillingState);
    if (state.membershipStatus === 'expired') {
      throw new AppException(
        ErrorCode.SUBSCRIPTION_REQUIRED,
        'Abonelik süreniz sona erdi. Devam etmek için aboneliğinizi yenileyin.',
        { subscriptionEndsAt: state.subscriptionEndsAt, graceEndsAt: state.graceEndsAt },
      );
    }
    return true;
  }
}
