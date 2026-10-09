import { ExecutionContext } from '@nestjs/common';
import { PlatformAdminGuard } from './platform-admin.guard';
import { ErrorCode } from '../../shared/errors/error-codes';
import { AUTHENTICATED_USER_KEY } from '../../shared/auth/firebase-auth.guard';

import { FirebaseService } from '../../shared/firebase/firebase.service';

describe('PlatformAdminGuard', () => {
  let guard: PlatformAdminGuard;
  let mockFirebase: { db: { collection: jest.Mock } };

  beforeEach(() => {
    mockFirebase = {
      db: {
        collection: jest.fn(),
      },
    };
    guard = new PlatformAdminGuard(mockFirebase as unknown as FirebaseService);
  });

  function createMockContext(uid: string) {
    const request = {
      header: jest.fn(),
      [AUTHENTICATED_USER_KEY]: { uid, email: 'admin@odivon.com' },
    } as unknown as Record<string, unknown>;
    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;
  }

  it('rejects if platform admin doc does not exist in Firestore', async () => {
    mockFirebase.db.collection.mockReturnValue({
      doc: jest.fn().mockReturnValue({
        get: jest.fn().mockResolvedValue({ exists: false }),
      }),
    });

    const ctx = createMockContext('user-1');
    await expect(guard.canActivate(ctx)).rejects.toMatchObject({
      code: ErrorCode.PLATFORM_ADMIN_REQUIRED,
    });
  });

  it('rejects if platform admin status is inactive', async () => {
    mockFirebase.db.collection.mockReturnValue({
      doc: jest.fn().mockReturnValue({
        get: jest.fn().mockResolvedValue({
          exists: true,
          data: () => ({ uid: 'user-1', status: 'inactive' }),
        }),
      }),
    });

    const ctx = createMockContext('user-1');
    await expect(guard.canActivate(ctx)).rejects.toMatchObject({
      code: ErrorCode.PLATFORM_FORBIDDEN,
    });
  });

  it('allows access if platform admin is active and attaches admin to request', async () => {
    const adminData = { uid: 'user-1', email: 'admin@odivon.com', status: 'active' };
    mockFirebase.db.collection.mockReturnValue({
      doc: jest.fn().mockReturnValue({
        get: jest.fn().mockResolvedValue({
          exists: true,
          data: () => adminData,
        }),
      }),
    });

    const ctx = createMockContext('user-1');
    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);

    const req = ctx.switchToHttp().getRequest() as Record<string, unknown>;
    expect(req.platformAdmin).toEqual(adminData);
  });
});
