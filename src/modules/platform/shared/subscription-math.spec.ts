import {
  calculateExtendedDate,
  computeTenantStatus,
  daysDifference,
} from './subscription-math';

describe('subscription-math', () => {
  const baseTime = new Date('2026-05-01T10:00:00.000Z');

  describe('calculateExtendedDate', () => {
    it('extends from current future date when current date is in future', () => {
      const futureDate = '2026-05-10T10:00:00.000Z';
      const extended = calculateExtendedDate(futureDate, 14, baseTime);
      expect(extended).toBe('2026-05-24T10:00:00.000Z');
    });

    it('extends from now when current date is in the past', () => {
      const pastDate = '2026-04-10T10:00:00.000Z';
      const extended = calculateExtendedDate(pastDate, 7, baseTime);
      expect(extended).toBe('2026-05-08T10:00:00.000Z');
    });

    it('extends from now when current date is undefined or empty', () => {
      const extended = calculateExtendedDate(null, 30, baseTime);
      expect(extended).toBe('2026-05-31T10:00:00.000Z');
    });
  });

  describe('daysDifference', () => {
    it('returns positive days for future date', () => {
      const future = '2026-05-06T10:00:00.000Z'; // +5 days
      expect(daysDifference(future, baseTime)).toBe(5);
    });

    it('returns negative days for past date', () => {
      const past = '2026-04-28T10:00:00.000Z'; // -3 days
      expect(daysDifference(past, baseTime)).toBe(-3);
    });

    it('returns null for invalid or missing date', () => {
      expect(daysDifference(null, baseTime)).toBeNull();
      expect(daysDifference('invalid-date', baseTime)).toBeNull();
    });
  });

  describe('computeTenantStatus', () => {
    it('returns suspended when tenant.status is inactive', () => {
      const status = computeTenantStatus(
        {
          status: 'inactive',
          membershipStatus: 'active',
          subscriptionEndsAt: '2026-06-01T00:00:00.000Z',
        },
        baseTime,
      );
      expect(status.computedStatus).toBe('suspended');
      expect(status.isSuspended).toBe(true);
    });

    it('returns trial when within trial period', () => {
      const status = computeTenantStatus(
        {
          status: 'active',
          membershipStatus: 'trial',
          trialEndsAt: '2026-05-10T10:00:00.000Z',
        },
        baseTime,
      );
      expect(status.computedStatus).toBe('trial');
      expect(status.isExpired).toBe(false);
      expect(status.daysLeft).toBe(9);
    });

    it('returns expired when trial date is in the past', () => {
      const status = computeTenantStatus(
        {
          status: 'active',
          membershipStatus: 'trial',
          trialEndsAt: '2026-04-20T10:00:00.000Z',
        },
        baseTime,
      );
      expect(status.computedStatus).toBe('expired');
      expect(status.isExpired).toBe(true);
      expect(status.daysLeft).toBe(-11);
    });

    it('returns active when subscription end date is in future', () => {
      const status = computeTenantStatus(
        {
          status: 'active',
          membershipStatus: 'active',
          subscriptionEndsAt: '2026-06-01T10:00:00.000Z',
        },
        baseTime,
      );
      expect(status.computedStatus).toBe('active');
      expect(status.isExpired).toBe(false);
      expect(status.daysLeft).toBe(31);
    });
  });
});
