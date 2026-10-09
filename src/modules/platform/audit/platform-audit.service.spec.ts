import { FirebaseService } from '../../../shared/firebase/firebase.service';
import { PlatformAuditService } from './platform-audit.service';

describe('PlatformAuditService', () => {
  let service: PlatformAuditService;
  let mockFirebase: { db: { collection: jest.Mock } };
  let mockSet: jest.Mock;

  beforeEach(() => {
    mockSet = jest.fn().mockResolvedValue(undefined);
    mockFirebase = {
      db: {
        collection: jest.fn().mockReturnValue({
          doc: jest.fn().mockReturnValue({
            id: 'audit-123',
            set: mockSet,
          }),
        }),
      },
    };
    service = new PlatformAuditService(mockFirebase as unknown as FirebaseService);
  });

  it('records an audit entry and redacts sensitive fields like passwords or tokens', async () => {
    await service.record({
      adminUid: 'admin-1',
      adminEmail: 'admin@odivon.com',
      action: 'TENANT_UPDATED',
      targetType: 'tenant',
      tenantId: 't-1',
      targetId: 't-1',
      before: { name: 'Old', password: 'secret-pass' },
      after: { name: 'New', token: 'bearer-xyz' },
      reason: 'Name change request',
    });

    expect(mockSet).toHaveBeenCalledTimes(1);
    const recorded = mockSet.mock.calls[0][0];
    expect(recorded.adminUid).toBe('admin-1');
    expect(recorded.action).toBe('TENANT_UPDATED');
    expect(recorded.before.name).toBe('Old');
    expect(recorded.before.password).toBe('[REDACTED]');
    expect(recorded.after.name).toBe('New');
    expect(recorded.after.token).toBe('[REDACTED]');
    expect(recorded.reason).toBe('Name change request');
    expect(recorded.createdAt).toBeDefined();
  });
});
