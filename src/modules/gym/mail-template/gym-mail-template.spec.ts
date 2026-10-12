import { GymMailTemplateService } from './gym-mail-template.service';
import { DEFAULT_MEMBER_MAIL_TEMPLATE } from './gym-mail-template.entity';

describe('GymMailTemplateService', () => {
  const repo = {
    get: jest.fn(),
    save: jest.fn(),
  };

  let service: GymMailTemplateService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new GymMailTemplateService(repo as never);
  });

  it('returns default template when not customized', async () => {
    repo.get.mockResolvedValue(DEFAULT_MEMBER_MAIL_TEMPLATE);
    const result = await service.getTemplate();
    expect(result).toEqual(DEFAULT_MEMBER_MAIL_TEMPLATE);
    expect(repo.get).toHaveBeenCalled();
  });

  it('updates template configuration', async () => {
    const patch = {
      enabled: true,
      subject: 'Özel Başlık {{tenantName}}',
      heading: 'Hoş Geldiniz',
      customMessage: 'Özel mesaj',
      includeCredentials: true,
      includeQrCodeInfo: true,
      mobileAppUrl: 'https://gym.odivon.com',
    };
    repo.save.mockResolvedValue({ ...patch, updatedAt: new Date().toISOString() });
    const result = await service.updateTemplate(patch);
    expect(result.subject).toBe('Özel Başlık {{tenantName}}');
    expect(repo.save).toHaveBeenCalledWith(patch);
  });
});
