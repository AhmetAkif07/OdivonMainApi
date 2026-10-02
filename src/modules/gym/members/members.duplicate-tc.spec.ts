import { AppException } from '../../../shared/errors/app.exception';
import { MembersRepository } from './members.repository';
import { GymMember } from './member.entity';

describe('MembersRepository - Duplicate TC Enforcement', () => {
  let repository: MembersRepository;
  let mockMembers: GymMember[] = [];

  beforeEach(() => {
    mockMembers = [
      {
        uid: 'user-1',
        displayName: 'Mevcut Uye',
        email: 'mevcut@example.com',
        nationalId: '11111111110',
        membershipStatus: 'active',
      } as GymMember,
    ];

    const mockFirebase = {
      auth: {
        createUser: jest.fn().mockResolvedValue({ uid: 'new-uid' }),
        setCustomUserClaims: jest.fn().mockResolvedValue(undefined),
        updateUser: jest.fn().mockResolvedValue(undefined),
        deleteUser: jest.fn().mockResolvedValue(undefined),
      },
    };

    const mockTenantContext = {
      getStore: () => ({ tenantId: 'tenant-1', modules: ['gym'] }),
      getUserId: () => 'admin-user',
    };

    const mockUsers = {
      createProfile: jest.fn().mockResolvedValue(undefined),
      updateProfile: jest.fn().mockResolvedValue(undefined),
      hardDelete: jest.fn().mockResolvedValue(undefined),
    };

    // Constructor signature: (firebase, tenantContext, users)
    repository = new MembersRepository(mockFirebase as never, mockTenantContext as never, mockUsers as never);

    // Mock collection to return mockMembers for listUndeleted
    jest.spyOn<any, any>(repository, 'collection').mockReturnValue({
      get: jest.fn().mockResolvedValue({
        docs: mockMembers.map((m) => ({
          id: m.uid,
          data: () => m,
        })),
      }),
      doc: jest.fn().mockImplementation((id: string) => ({
        get: jest.fn().mockResolvedValue({
          exists: true,
          data: () => mockMembers.find((m) => m.uid === id),
        }),
        set: jest.fn().mockResolvedValue(undefined),
        update: jest.fn().mockResolvedValue(undefined),
      })),
    });
  });

  it('rejects member creation when nationalId is already registered', async () => {
    await expect(
      repository.create({
        displayName: 'Ikinci Uye',
        email: 'ikinci@example.com',
        password: 'password123',
        nationalId: '11111111110', // Duplicate TC
      }),
    ).rejects.toThrow('Bu T.C. Kimlik Numarası (11111111110) ile kayıtlı bir üye (Mevcut Uye) zaten mevcuttur.');
  });

  it('rejects member creation when nationalId format is invalid', async () => {
    await expect(
      repository.create({
        displayName: 'Gecersiz TC',
        email: 'gecersiz@example.com',
        password: 'password123',
        nationalId: '01234567890', // Starts with 0
      }),
    ).rejects.toThrow('Geçerli bir 11 haneli T.C. Kimlik Numarası zorunludur.');
  });

  it('rejects member update when changing nationalId to another existing member', async () => {
    mockMembers.push({
      uid: 'user-2',
      displayName: 'Diger Uye',
      email: 'diger@example.com',
      nationalId: '22222222220',
      membershipStatus: 'active',
    } as GymMember);

    await expect(
      repository.update('user-2', {
        nationalId: '11111111110', // Already belongs to user-1
      }),
    ).rejects.toThrow('Bu T.C. Kimlik Numarası (11111111110) ile kayıtlı başka bir üye (Mevcut Uye) mevcuttur.');
  });

  it('allows member update keeping their own nationalId', async () => {
    const updated = await repository.update('user-1', {
      displayName: 'Mevcut Uye Guncel',
      nationalId: '11111111110', // Same TC
    });
    expect(updated.displayName).toBe('Mevcut Uye Guncel');
  });
});
