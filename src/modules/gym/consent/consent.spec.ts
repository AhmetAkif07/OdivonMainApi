import { GymConsentService, GYM_CONSENT_COLLECTIONS } from './consent.service';
import { DEFAULT_CONSENT_TEXTS } from './consent.default-texts';

describe('GymConsentService', () => {
  let service: GymConsentService;
  let mockStore: any;
  let mockMembers: any;
  let inMemoryDb: Map<string, any[]>;

  beforeEach(() => {
    inMemoryDb = new Map();
    mockStore = {
      tenantId: () => 'tenant-123',
      userId: () => 'staff-456',
      list: jest.fn().mockImplementation(async (colName: string) => {
        return inMemoryDb.get(colName) || [];
      }),
      create: jest.fn().mockImplementation(async (colName: string, fields: any) => {
        const item = { id: 'doc_' + Math.random(), ...fields };
        const list = inMemoryDb.get(colName) || [];
        list.push(item);
        inMemoryDb.set(colName, list);
        return item;
      }),
      collection: jest.fn().mockReturnValue({
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({ exists: false, data: () => null }),
          set: jest.fn().mockResolvedValue(true),
        }),
      }),
    };

    mockMembers = {
      getByIdOrThrow: jest.fn().mockResolvedValue({
        id: 'member-1',
        displayName: 'Ahmet Yılmaz',
        kvkkConsent: null,
      }),
      update: jest.fn().mockResolvedValue({ id: 'member-1' }),
    };

    service = new GymConsentService(mockStore, mockMembers);
  });

  it('should return default consent texts when no custom texts are saved', async () => {
    const texts = await service.getActiveTexts();
    expect(texts).toBeDefined();
    expect(texts.length).toBe(DEFAULT_CONSENT_TEXTS.length);
    expect(texts.some((t) => t.type === 'kvkk_general')).toBe(true);
    expect(texts.some((t) => t.type === 'commercial_communication')).toBe(true);
  });

  it('should record member consent and update member summary', async () => {
    const result = await service.recordConsents({
      memberId: 'member-1',
      memberFullName: 'Ahmet Yılmaz',
      channel: 'ADMIN_PANEL',
      consents: [
        { consentType: 'kvkk_general', version: '1.0', granted: true },
        { consentType: 'commercial_communication', version: '1.0', granted: false },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.recordedCount).toBe(2);
    expect(mockStore.create).toHaveBeenCalledTimes(2);
    expect(mockMembers.update).toHaveBeenCalledWith(
      'member-1',
      expect.objectContaining({
        kvkkConsent: true,
        commercialConsent: false,
      }),
    );
  });

  it('should revoke a consent and record revocation log', async () => {
    const result = await service.revokeConsent({
      memberId: 'member-1',
      consentType: 'kvkk_general',
      reason: 'Üye rızasını iptal etti',
    });

    expect(result.success).toBe(true);
    expect(result.revoked).toBe('kvkk_general');
    expect(mockMembers.update).toHaveBeenCalledWith(
      'member-1',
      expect.objectContaining({
        kvkkConsent: false,
        kvkkConsentAt: null,
      }),
    );
  });
});
