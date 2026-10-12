import { MailService } from './mail.service';

describe('MailService', () => {
  let service: MailService;
  const originalEnv = process.env;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env = { ...originalEnv };
    service = new MailService();
  });

  afterAll(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
  });

  it('returns false gracefully when SMTP_PASS is not provided', async () => {
    delete process.env.SMTP_PASS;
    const sent = await service.sendWelcomeGymOwner({
      to: 'owner@example.com',
      tenantName: 'Titan Gym',
      displayName: 'Ahmet',
    });
    expect(sent).toBe(false);
  });

  it('sends verification mail through Hostinger HTTPS API when configured', async () => {
    delete process.env.SMTP_PASS;
    process.env.HOSTINGER_MAIL_API_TOKEN = 'test-token';
    process.env.HOSTINGER_MAILBOX_RESOURCE_ID = 'ACtest';
    global.fetch = jest.fn().mockResolvedValue({ status: 204 });

    const sent = await service.sendVerificationEmail({
      to: 'owner@example.com',
      displayName: 'Owner',
      tenantName: 'Gym',
      verificationLink: 'https://gym.odivon.com/auth/verify-email?token=test',
    });

    expect(sent).toBe(true);
    const [url, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://api.mail.hostinger.com/api/v1/mailboxes/ACtest/send');
    expect(options.headers.Authorization).toBe('Bearer test-token');
    expect(JSON.parse(options.body)).toEqual(expect.objectContaining({
      to: ['owner@example.com'],
      subject: expect.stringContaining('Doğrulayın'),
      html: expect.stringContaining('https://gym.odivon.com/auth/verify-email?token=test'),
    }));
  });

  it('does not report success when Hostinger rejects a message', async () => {
    process.env.HOSTINGER_MAIL_API_TOKEN = 'test-token';
    process.env.HOSTINGER_MAILBOX_RESOURCE_ID = 'ACtest';
    global.fetch = jest.fn().mockResolvedValue({ status: 401 });

    const sent = await service.sendVerificationEmail({
      to: 'owner@example.com',
      tenantName: 'Gym',
      verificationLink: 'https://gym.odivon.com/auth/verify-email?token=test',
    });

    expect(sent).toBe(false);
  });
});
