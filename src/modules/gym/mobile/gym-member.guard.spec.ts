import { GymMemberGuard } from './gym-member.guard';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { AppException } from '../../../shared/errors/app.exception';

describe('GymMemberGuard', () => {
  const members = { getByIdOrThrow: jest.fn() };
  const tenantContext = { getUserId: jest.fn().mockReturnValue('u1') };
  let guard: GymMemberGuard;

  beforeEach(() => {
    jest.resetAllMocks();
    tenantContext.getUserId.mockReturnValue('u1');
    guard = new GymMemberGuard(members as never, tenantContext as never);
  });

  it('allows an active gym member', async () => {
    members.getByIdOrThrow.mockResolvedValue({ uid: 'u1', isArchived: false });
    await expect(guard.canActivate()).resolves.toBe(true);
  });

  it('rejects staff without a gymMembers record', async () => {
    members.getByIdOrThrow.mockRejectedValue(new AppException(ErrorCode.GYM_MEMBER_NOT_FOUND, 'missing'));
    await expect(guard.canActivate()).rejects.toMatchObject({ code: ErrorCode.GYM_MEMBER_FORBIDDEN });
  });

  it('rejects archived members', async () => {
    members.getByIdOrThrow.mockResolvedValue({ uid: 'u1', isArchived: true });
    await expect(guard.canActivate()).rejects.toMatchObject({ code: ErrorCode.GYM_MEMBER_FORBIDDEN });
  });
});
