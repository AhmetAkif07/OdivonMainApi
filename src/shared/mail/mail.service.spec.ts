import { MailService } from './mail.service';

describe('MailService', () => {
  let service: MailService;
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    service = new MailService();
  });

  afterAll(() => {
    process.env = originalEnv;
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
});
