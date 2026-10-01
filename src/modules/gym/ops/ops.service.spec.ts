import { GymOpsService } from './ops.service';

describe('GymOpsService.scan token', () => {
  const store = {
    create: jest.fn(),
    collection: jest.fn(),
    page: jest.fn(),
    update: jest.fn(),
    softDelete: jest.fn(),
    list: jest.fn(),
    getSingleton: jest.fn(),
    upsertSingleton: jest.fn(),
  };
  const members = { getByIdOrThrow: jest.fn(), list: jest.fn() };
  const packages = { list: jest.fn() };
  let service: GymOpsService;

  beforeEach(() => {
    jest.resetAllMocks();
    store.create.mockImplementation(async (_name: string, fields: object) => ({ id: 'log', ...fields }));
    packages.list.mockResolvedValue([]);
    service = new GymOpsService(store as never, members as never, packages as never, {} as never);
  });

  it('denies an expired QR token', async () => {
    store.collection.mockReturnValue({
      doc: () => ({
        get: async () => ({
          exists: true,
          data: () => ({
            userId: 'u1',
            expiresAt: new Date(Date.now() - 1000).toISOString(),
            usedAt: null,
            deletedAt: null,
          }),
        }),
      }),
    });

    const result = await service.scan({ token: 'expired', gateName: 'A1' });
    expect(result.allowed).toBe(false);
    expect(result.message).toContain('süresi');
  });

  it('consumes a valid token and grants access', async () => {
    const update = jest.fn();
    store.collection.mockReturnValue({
      doc: () => ({
        get: async () => ({
          exists: true,
          data: () => ({
            userId: 'u1',
            expiresAt: new Date(Date.now() + 30000).toISOString(),
            usedAt: null,
            deletedAt: null,
          }),
        }),
        update,
      }),
    });
    members.getByIdOrThrow.mockResolvedValue({
      uid: 'u1',
      displayName: 'Ahmet',
      photoURL: null,
      membershipStatus: 'active',
      membershipEndsAt: new Date(Date.now() + 86400000).toISOString(),
      packageLabel: null,
    });

    const result = await service.scan({ token: 'ok', gateName: 'A1' });
    expect(result.allowed).toBe(true);
    expect(update).toHaveBeenCalled();
  });
});

describe('GymOpsService.saveSaas', () => {
  it('refuses plan, status and period changes from the gym; only refreshes usage', async () => {
    const store = { upsertSingleton: jest.fn(async (_name: string, fields: object) => fields) };
    const members = { list: jest.fn(async () => [{}, {}]) };
    const service = new GymOpsService(store as never, members as never, {} as never, {} as never);
    await expect(service.saveSaas({ status: 'active', planId: 'enterprise' } as never)).rejects.toMatchObject({ code: 'FORBIDDEN_ROLE' });
    await expect(service.saveSaas({ currentPeriodEndsAt: '2030-01-01' } as never)).rejects.toMatchObject({ code: 'FORBIDDEN_ROLE' });
    expect(store.upsertSingleton).not.toHaveBeenCalled();
    await expect(service.saveSaas({} as never)).resolves.toEqual({ memberCount: 2 });
  });
});

describe('GymOpsService access settings', () => {
  it('keeps live log refresh off unless the gym switches it on', async () => {
    let stored: Record<string, unknown> | null = null;
    const store = {
      getSingleton: jest.fn(async () => stored),
      upsertSingleton: jest.fn(async (_name: string, fields: Record<string, unknown>) => (stored = { ...fields })),
    };
    const service = new GymOpsService(store as never, {} as never, {} as never, {} as never);
    expect(await service.getAccessSettings()).toEqual({ liveRefresh: false });
    expect(await service.saveAccessSettings({ liveRefresh: true })).toEqual({ liveRefresh: true });
    expect(await service.getAccessSettings()).toEqual({ liveRefresh: true });
  });
});
