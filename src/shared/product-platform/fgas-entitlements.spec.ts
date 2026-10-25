import { fgasEntitlements } from './fgas-entitlements';

describe('F-Gas plan entitlements', () => {
  it('gives trials pro limits and keeps legacy paid tenants unlocked', () => {
    expect(fgasEntitlements({ membershipStatus: 'trial' })).toMatchObject({
      planId: 'pro',
      maxEquipment: 1_000,
      maxUsers: 15,
    });
    expect(fgasEntitlements({ membershipStatus: 'active' })).toMatchObject({
      planId: 'enterprise',
      maxEquipment: null,
    });
  });
  it('returns enforceable starter limits', () => {
    expect(fgasEntitlements({ planId: 'starter' })).toEqual({
      planId: 'starter',
      maxEquipment: 100,
      maxOperations: 2_500,
      maxUsers: 3,
      advancedReports: false,
      prioritySupport: false,
    });
  });
});
