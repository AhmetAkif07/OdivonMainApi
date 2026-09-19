import { IdentityService } from './identity.service';
import { ErrorCode } from '../../shared/errors/error-codes';
import { AppException } from '../../shared/errors/app.exception';

describe('IdentityService.register', () => {
  const firebase = {
    auth: {
      createUser: jest.fn(),
      setCustomUserClaims: jest.fn(),
      deleteUser: jest.fn(),
    },
  };
  const tenants = {
    create: jest.fn(),
    getById: jest.fn(),
    hardDelete: jest.fn(),
  };
  const users = {
    createProfile: jest.fn(),
    findByUid: jest.fn(),
    listByCurrentTenant: jest.fn(),
    hardDelete: jest.fn(),
  };
  const tenantContext = {
    getStore: jest.fn(),
  };

  let service: IdentityService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new IdentityService(
      firebase as never,
      tenants as never,
      users as never,
      tenantContext as never,
    );
  });

  it('creates auth user, tenant, profile and claims', async () => {
    firebase.auth.createUser.mockResolvedValue({ uid: 'uid-1' });
    tenants.create.mockResolvedValue({ id: 'tenant-1' });
    users.createProfile.mockResolvedValue({});
    firebase.auth.setCustomUserClaims.mockResolvedValue(undefined);

    const result = await service.register({
      email: 'clinic@example.com',
      password: 'password1',
      tenantName: 'Clinic',
    });

    expect(result).toEqual({
      uid: 'uid-1',
      email: 'clinic@example.com',
      tenantId: 'tenant-1',
      role: 'owner',
      modules: ['vet'],
    });
    expect(firebase.auth.setCustomUserClaims).toHaveBeenCalledWith('uid-1', {
      tenantId: 'tenant-1',
      role: 'owner',
      modules: ['vet'],
    });
  });

  it('explains missing Firebase Authentication configuration', async () => {
    firebase.auth.createUser.mockRejectedValue({
      code: 'auth/configuration-not-found',
      message: 'There is no configuration corresponding to the provided identifier.',
    });

    await expect(
      service.register({
        email: 'clinic@example.com',
        password: 'password1',
        tenantName: 'Clinic',
      }),
    ).rejects.toMatchObject({
      code: ErrorCode.VALIDATION_ERROR,
      message: expect.stringContaining('Firebase Authentication is not enabled'),
    });
  });

  it('rolls back auth user if tenant creation fails', async () => {
    firebase.auth.createUser.mockResolvedValue({ uid: 'uid-1' });
    tenants.create.mockRejectedValue(new Error('firestore down'));
    firebase.auth.deleteUser.mockResolvedValue(undefined);

    await expect(
      service.register({
        email: 'clinic@example.com',
        password: 'password1',
        tenantName: 'Clinic',
      }),
    ).rejects.toBeInstanceOf(AppException);

    expect(firebase.auth.deleteUser).toHaveBeenCalledWith('uid-1');
    expect(users.hardDelete).not.toHaveBeenCalled();
  });
});

describe('IdentityService.me', () => {
  it('uses Firestore profile plus tenant summary, not claims alone', async () => {
    const firebase = { auth: {} };
    const tenants = {
      getById: jest.fn().mockResolvedValue({ id: 't1', name: 'Clinic', status: 'active' }),
    };
    const users = {
      findByUid: jest.fn().mockResolvedValue({
        uid: 'u1',
        email: 'a@b.com',
        tenantId: 't1',
        role: 'owner',
        modules: ['vet'],
      }),
    };
    const tenantContext = {
      getStore: jest.fn().mockReturnValue({ userId: 'u1', tenantId: 't1' }),
    };
    const service = new IdentityService(
      firebase as never,
      tenants as never,
      users as never,
      tenantContext as never,
    );

    await expect(service.me()).resolves.toEqual({
      uid: 'u1',
      email: 'a@b.com',
      tenantId: 't1',
      role: 'owner',
      modules: ['vet'],
      tenant: { id: 't1', name: 'Clinic', status: 'active' },
    });
  });

  it('throws USER_NOT_FOUND when profile is missing', async () => {
    const service = new IdentityService(
      { auth: {} } as never,
      { getById: jest.fn() } as never,
      { findByUid: jest.fn().mockResolvedValue(null) } as never,
      { getStore: jest.fn().mockReturnValue({ userId: 'u1' }) } as never,
    );
    await expect(service.me()).rejects.toMatchObject({ code: ErrorCode.USER_NOT_FOUND });
  });
});
