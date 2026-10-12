import { IdentityService } from './identity.service';
import { ErrorCode } from '../../shared/errors/error-codes';
import { AppException } from '../../shared/errors/app.exception';

describe('IdentityService.register', () => {
  const firebase = {
    auth: {
      createUser: jest.fn(),
      setCustomUserClaims: jest.fn(),
      deleteUser: jest.fn(),
      updateUser: jest.fn(),
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
  
  const roles = {
    assertRolesExist: jest.fn().mockResolvedValue([]),
    resolvePermissions: jest.fn().mockResolvedValue([]),
  };
  const mail = {
    sendWelcomeGymOwner: jest.fn().mockResolvedValue(true),
    sendModuleWelcome: jest.fn().mockResolvedValue(true),
    sendVerificationEmail: jest.fn().mockResolvedValue(true),
  };

  let service: IdentityService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new IdentityService(
      firebase as never,
      tenants as never,
      users as never,
      tenantContext as never,
      roles as never,
      mail as never,
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
    expect(mail.sendVerificationEmail).toHaveBeenCalledWith(expect.objectContaining({
      module: 'vet',
      verificationLink: expect.stringContaining('https://vet.odivon.com/verify-email?token='),
    }));
  });

  it('registers a gym tenant with trial membership', async () => {
    firebase.auth.createUser.mockResolvedValue({ uid: 'uid-2' });
    tenants.create.mockResolvedValue({ id: 'tenant-2' });
    users.createProfile.mockResolvedValue({});
    firebase.auth.setCustomUserClaims.mockResolvedValue(undefined);
    firebase.auth.updateUser.mockResolvedValue({});

    const result = await service.register({
      email: 'gym@example.com',
      password: 'password1',
      tenantName: 'Gym',
      module: 'gym',
      displayName: 'Owner',
    });

    expect(result.modules).toEqual(['gym']);
    expect(tenants.create).toHaveBeenCalledWith(
      expect.objectContaining({
        modules: ['gym'],
        onboardingCompleted: false,
        membershipStatus: 'trial',
      }),
    );
    expect(firebase.auth.setCustomUserClaims).toHaveBeenCalledWith('uid-2', {
      tenantId: 'tenant-2',
      role: 'owner',
      modules: ['gym'],
    });
    expect(mail.sendVerificationEmail).toHaveBeenCalledWith(expect.objectContaining({
      module: 'gym',
      verificationLink: expect.stringContaining('https://gym.odivon.com/auth/verify-email?token='),
    }));
  });

  it('sends the module welcome mail without failing the registration when it rejects', async () => {
    process.env.APP_URL_SPA = 'https://spa.example.com';
    firebase.auth.createUser.mockResolvedValue({ uid: 'uid-3' });
    tenants.create.mockResolvedValue({ id: 'tenant-3' });
    users.createProfile.mockResolvedValue({});
    firebase.auth.setCustomUserClaims.mockResolvedValue(undefined);
    mail.sendModuleWelcome.mockRejectedValue(new Error('smtp down'));

    const result = await service.register({
      email: 'spa@example.com',
      password: 'password1',
      tenantName: 'Spa',
      module: 'spa',
      displayName: 'Owner',
    });

    expect(result.modules).toEqual(['spa']);
    expect(mail.sendModuleWelcome).toHaveBeenCalledWith({
      module: 'spa',
      to: 'spa@example.com',
      displayName: 'Owner',
      tenantName: 'Spa',
      trialDays: 14,
    });
    expect(mail.sendWelcomeGymOwner).not.toHaveBeenCalled();
    expect(firebase.auth.deleteUser).not.toHaveBeenCalled();
    delete process.env.APP_URL_SPA;
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


describe('IdentityService.resendVerification', () => {
  const profile = {
    uid: 'uid-1',
    email: 'owner@example.com',
    tenantId: 'tenant-1',
    emailVerified: false,
    displayName: 'Owner',
    modules: ['vet'],
  };
  const users = {
    findByEmail: jest.fn(),
    updateProfile: jest.fn().mockResolvedValue(undefined),
  };
  const tenants = { getById: jest.fn().mockResolvedValue({ name: 'Gym' }) };
  const mail = { sendVerificationEmail: jest.fn() };
  const service = new IdentityService(
    {} as never,
    tenants as never,
    users as never,
    {} as never,
    {} as never,
    mail as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    users.findByEmail.mockResolvedValue(profile);
    users.updateProfile.mockResolvedValue(undefined);
    tenants.getById.mockResolvedValue({ name: 'Gym' });
  });

  it('waits for SMTP acceptance before reporting success', async () => {
    mail.sendVerificationEmail.mockResolvedValue(true);

    await expect(service.resendVerification(' OWNER@example.com ')).resolves.toEqual({ success: true });
    expect(users.findByEmail).toHaveBeenCalledWith('owner@example.com');
    expect(mail.sendVerificationEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: profile.email,
      verificationLink: expect.stringContaining('https://vet.odivon.com/verify-email?token='),
      module: 'vet',
    }));
  });

  it('reports a service error when SMTP rejects the message', async () => {
    mail.sendVerificationEmail.mockResolvedValue(false);

    await expect(service.resendVerification(profile.email)).rejects.toMatchObject({ status: 503 });
  });

  it('keeps the generic response for an unknown address', async () => {
    users.findByEmail.mockResolvedValue(null);

    await expect(service.resendVerification('unknown@example.com')).resolves.toEqual({ success: true });
    expect(mail.sendVerificationEmail).not.toHaveBeenCalled();
  });
});

  describe('IdentityService.verifyEmail', () => {
  it('verifies user and updates auth + firestore profile', async () => {
    const firebase = { auth: { updateUser: jest.fn().mockResolvedValue({}) } };
    const tenants = { getById: jest.fn().mockResolvedValue({ id: 't-1', name: 'Gym 1' }) };
    const users = {
      findByVerificationToken: jest.fn().mockResolvedValue({
        uid: 'uid-1',
        email: 'test@example.com',
        tenantId: 't-1',
        modules: ['gym'],
        displayName: 'Test',
        emailVerificationExpiresAt: new Date(Date.now() + 100000).toISOString(),
      }),
      updateProfile: jest.fn().mockResolvedValue(undefined),
    };
    const tenantContext = { getStore: jest.fn() };
    const roles = { assertRolesExist: jest.fn(), resolvePermissions: jest.fn() };
    const mail = { sendWelcomeGymOwner: jest.fn().mockResolvedValue(true) };

    const service = new IdentityService(
      firebase as never,
      tenants as never,
      users as never,
      tenantContext as never,
      roles as never,
      mail as never,
    );

    const result = await service.verifyEmail('valid-token');
    expect(result).toEqual({ success: true, email: 'test@example.com' });
    expect(firebase.auth.updateUser).toHaveBeenCalledWith('uid-1', { emailVerified: true });
    expect(users.updateProfile).toHaveBeenCalledWith(
      'uid-1',
      expect.objectContaining({ emailVerified: true, emailVerificationToken: null })
    );
  });

  it('throws VERIFICATION_TOKEN_INVALID for invalid token', async () => {
    const firebase = { auth: { updateUser: jest.fn() } };
    const tenants = { getById: jest.fn() };
    const users = { findByVerificationToken: jest.fn().mockResolvedValue(null) };
    const tenantContext = { getStore: jest.fn() };
    const roles = { assertRolesExist: jest.fn() };
    const mail = {};

    const service = new IdentityService(
      firebase as never,
      tenants as never,
      users as never,
      tenantContext as never,
      roles as never,
      mail as never,
    );

    await expect(service.verifyEmail('invalid-token')).rejects.toThrow(AppException);
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
    const service = new IdentityService(firebase as never, tenants as never, users as never, tenantContext as never, {} as never, {} as never);

    await expect(service.me()).resolves.toMatchObject({
      uid: 'u1',
      email: 'a@b.com',
      displayName: null,
      tenantId: 't1',
      role: 'owner',
      modules: ['vet'],
      roleIds: [],
      tenant: { id: 't1', name: 'Clinic', status: 'active' },
    });
    const result = await service.me();
    expect(result.permissions.customers).toEqual(['view', 'create', 'update', 'delete']);
    expect(result.permissions.members).toBeUndefined();
  });

  it('filters gym permissions for gym tenants', async () => {
    const service = new IdentityService(
      { auth: {} } as never,
      {
        getById: jest.fn().mockResolvedValue({
          id: 'g1',
          name: 'Gym',
          status: 'active',
          membershipStatus: 'trial',
          trialEndsAt: '2029-10-01T00:00:00.000Z',
          onboardingCompleted: false,
        }),
      } as never,
      {
        findByUid: jest.fn().mockResolvedValue({
          uid: 'u3',
          email: 'g@b.com',
          tenantId: 'g1',
          role: 'owner',
          modules: ['gym'],
        }),
      } as never,
      { getStore: jest.fn().mockReturnValue({ userId: 'u3', tenantId: 'g1' }) } as never,
      {} as never,
      {} as never,
    );

    const result = await service.me();
    expect(result.permissions.members).toEqual(['view', 'create', 'update', 'delete']);
    expect(result.permissions.customers).toBeUndefined();
    expect(result.onboardingCompleted).toBe(false);
    expect(result.membershipStatus).toBe('trial');
  });

  it('returns role-derived permissions for non-owner users', async () => {
    const service = new IdentityService(
      { auth: {} } as never,
      { getById: jest.fn().mockResolvedValue({ id: 't1', name: 'Clinic', status: 'active' }) } as never,
      {
        findByUid: jest.fn().mockResolvedValue({
          uid: 'u2',
          email: 'u@b.com',
          tenantId: 't1',
          role: 'user',
          modules: ['vet'],
          roleIds: ['r1'],
        }),
      } as never,
      {
        getStore: jest.fn().mockReturnValue({
          userId: 'u2',
          tenantId: 't1',
          permissions: { customers: ['view'] },
        }),
      } as never,
      {} as never,
      {} as never,
    );

    await expect(service.me()).resolves.toMatchObject({
      role: 'user',
      roleIds: ['r1'],
      permissions: { customers: ['view'] },
    });
  });

  it('throws USER_NOT_FOUND when profile is missing', async () => {
    const service = new IdentityService(
      { auth: {} } as never,
      { getById: jest.fn() } as never,
      { findByUid: jest.fn().mockResolvedValue(null) } as never,
      { getStore: jest.fn().mockReturnValue({ userId: 'u1' }) } as never,
      {} as never,
      {} as never,
    );
    await expect(service.me()).rejects.toMatchObject({ code: ErrorCode.USER_NOT_FOUND });
  });
});

describe('IdentityService user management', () => {
  const firebase = {
    auth: {
      createUser: jest.fn(),
      setCustomUserClaims: jest.fn(),
      deleteUser: jest.fn(),
      updateUser: jest.fn(),
      revokeRefreshTokens: jest.fn(),
    },
  };
  const users = {
    createProfile: jest.fn(),
    findByUid: jest.fn(),
    listByCurrentTenant: jest.fn(),
    updateProfile: jest.fn(),
    hardDelete: jest.fn(),
  };
  const tenantContext = {
    getStore: jest.fn(),
    getTenantId: jest.fn(),
  };
  
  const roles = {
    assertRolesExist: jest.fn().mockResolvedValue([]),
    resolvePermissions: jest.fn().mockResolvedValue([]),
  };
  const mail = { sendWelcomeGymOwner: jest.fn().mockResolvedValue(true) };

  let service: IdentityService;

  beforeEach(() => {
    jest.resetAllMocks();
    tenantContext.getStore.mockReturnValue({ tenantId: 't1', userId: 'owner-1', role: 'owner', modules: ['vet'] });
    tenantContext.getTenantId.mockReturnValue('t1');
    service = new IdentityService(
      firebase as never,
      {} as never,
      users as never,
      tenantContext as never,
      roles as never,
      mail as never,
    );
  });

  it('creates a tenant user with roles and claims', async () => {
    roles.assertRolesExist.mockResolvedValue(['r1']);
    firebase.auth.createUser.mockResolvedValue({ uid: 'u2' });

    const result = await service.createUser({
      email: 'staff@example.com',
      displayName: 'Staff',
      password: 'password1',
      roleIds: ['r1'],
    });

    expect(result).toMatchObject({ uid: 'u2', tenantId: 't1', role: 'user', roleIds: ['r1'], status: 'active' });
    expect(firebase.auth.setCustomUserClaims).toHaveBeenCalledWith('u2', {
      tenantId: 't1',
      role: 'user',
      modules: ['vet'],
    });
  });

  it('rolls back the auth user when profile creation fails', async () => {
    roles.assertRolesExist.mockResolvedValue([]);
    firebase.auth.createUser.mockResolvedValue({ uid: 'u2' });
    users.createProfile.mockRejectedValue(new Error('firestore down'));

    await expect(
      service.createUser({ email: 's@example.com', displayName: 'S', password: 'password1', roleIds: [] }),
    ).rejects.toBeInstanceOf(AppException);
    expect(firebase.auth.deleteUser).toHaveBeenCalledWith('u2');
  });

  it('refuses to modify the owner', async () => {
    users.findByUid.mockResolvedValue({ uid: 'owner-2', tenantId: 't1', role: 'owner' });
    await expect(service.updateUser('owner-2', { displayName: 'X' })).rejects.toMatchObject({
      code: ErrorCode.FORBIDDEN_ROLE,
    });
  });

  it('refuses to modify users of another tenant', async () => {
    users.findByUid.mockResolvedValue({ uid: 'u9', tenantId: 't2', role: 'user' });
    await expect(service.updateUser('u9', { displayName: 'X' })).rejects.toMatchObject({
      code: ErrorCode.USER_NOT_FOUND,
    });
  });

  it('disables auth and revokes tokens when deactivating', async () => {
    users.findByUid.mockResolvedValue({ uid: 'u2', tenantId: 't1', role: 'user' });

    await service.updateUser('u2', { status: 'inactive' });

    expect(firebase.auth.updateUser).toHaveBeenCalledWith('u2', { disabled: true });
    expect(firebase.auth.revokeRefreshTokens).toHaveBeenCalledWith('u2');
    expect(users.updateProfile).toHaveBeenCalledWith('u2', expect.objectContaining({ status: 'inactive' }));
  });

  it('prevents deleting your own account', async () => {
    await expect(service.deactivateUser('owner-1')).rejects.toMatchObject({
      code: ErrorCode.VALIDATION_ERROR,
    });
  });
});
