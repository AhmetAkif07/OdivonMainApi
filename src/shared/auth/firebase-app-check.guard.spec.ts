import { FirebaseAppCheckGuard } from './firebase-app-check.guard';

describe('FirebaseAppCheckGuard', () => {
  const context = (token?: string) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({
          header: (name: string) => (name === 'x-firebase-appcheck' ? token : undefined),
        }),
      }),
    }) as never;
  const verifyToken = jest.fn();
  const guard = new FirebaseAppCheckGuard({ appCheck: { verifyToken } } as never);
  afterEach(() => {
    delete process.env.FGAS_REQUIRE_APP_CHECK;
    jest.clearAllMocks();
  });
  it('allows staged environments while the rollout flag is disabled', async () => {
    await expect(guard.canActivate(context())).resolves.toBe(true);
  });
  it('requires and verifies a token when enabled', async () => {
    process.env.FGAS_REQUIRE_APP_CHECK = 'true';
    await expect(guard.canActivate(context())).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
    verifyToken.mockResolvedValue({ appId: 'fgas-web' });
    await expect(guard.canActivate(context('valid'))).resolves.toBe(true);
  });
});
