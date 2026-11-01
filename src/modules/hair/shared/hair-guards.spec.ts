import { GUARDS_METADATA } from '@nestjs/common/constants';
import { SubscriptionGuard } from '../../../shared/authorization/subscription.guard';
import { HairAppointmentsController } from '../appointments/hair-appointments.controller';
import { HairCoreController } from '../core/hair-core.controller';
import { HairCustomersController } from '../customers/hair-customers.controller';
import { HairGuards, HairOpenGuards } from './hair-guards';

const guardsOf = (target: object) => (Reflect.getMetadata(GUARDS_METADATA, target) ?? []) as unknown[];

describe('hair subscription gate', () => {
  it('closes salon data routes when the subscription has ended', () => {
    expect(HairGuards).toContain(SubscriptionGuard);
    expect(guardsOf(HairAppointmentsController)).toContain(SubscriptionGuard);
    expect(guardsOf(HairCustomersController)).toContain(SubscriptionGuard);
  });

  it('keeps /hair/me, settings and branches open so an expired salon can still sign in', () => {
    expect(HairOpenGuards).not.toContain(SubscriptionGuard);
    expect(guardsOf(HairCoreController)).not.toContain(SubscriptionGuard);
  });
});
