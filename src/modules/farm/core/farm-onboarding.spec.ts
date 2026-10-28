import { FarmOnboardingService } from './farm-onboarding';

describe('FarmOnboardingService', () => {
  const batch = { set: jest.fn(), commit: jest.fn().mockResolvedValue(undefined) };
  const firebase = {
    db: { batch: () => batch, collection: () => ({ doc: () => ({}) }) },
    auth: { setCustomUserClaims: jest.fn().mockResolvedValue(undefined) },
  };
  const tenants = { create: jest.fn(), hardDelete: jest.fn() };
  const users = { findByUid: jest.fn(), createProfile: jest.fn(), hardDelete: jest.fn() };
  const mail = {
    sendVerificationEmail: jest.fn().mockResolvedValue(true),
    sendModuleWelcome: jest.fn().mockResolvedValue(true),
  };
  const service = new FarmOnboardingService(
    firebase as never,
    tenants as never,
    users as never,
    mail as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    users.findByUid.mockResolvedValue(null);
    users.createProfile.mockResolvedValue(undefined);
    tenants.create.mockResolvedValue({ id: 'tenant-1' });
  });

  it('keeps the new owner unverified and mails a farm.odivon.com verification link', async () => {
    await service.onboard('uid-1', 'Owner@Example.com', {
      farmName: 'Test Çiftliği',
      displayName: 'Owner',
    } as never);

    const profile = users.createProfile.mock.calls[0][0];
    expect(profile.emailVerified).toBe(false);
    expect(profile.emailVerificationToken).toMatch(/^[a-f0-9]{64}$/);
    expect(mail.sendVerificationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        module: 'farm',
        to: 'owner@example.com',
        tenantName: 'Test Çiftliği',
        verificationLink: `https://farm.odivon.com/auth/verify-email?token=${profile.emailVerificationToken}`,
      }),
    );
    // Welcome mail waits until the link is opened.
    expect(mail.sendModuleWelcome).not.toHaveBeenCalled();
  });
});
