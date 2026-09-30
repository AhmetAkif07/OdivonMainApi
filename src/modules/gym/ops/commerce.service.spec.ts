import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { GymCommerceService } from './commerce.service';

describe('GymCommerceService wallet and package sale', () => {
  const store = { create: jest.fn(), userId: jest.fn() };
  const members = { getByIdOrThrow: jest.fn(), save: jest.fn() };
  const accessSync = { syncMemberSafely: jest.fn() };
  const packages = { getByIdOrThrow: jest.fn() };
  let service: GymCommerceService;

  beforeEach(() => {
    jest.resetAllMocks();
    store.userId.mockReturnValue('staff-1');
    store.create.mockImplementation(async (_name: string, fields: object) => ({ id: 'tx', ...fields }));
    members.getByIdOrThrow.mockResolvedValue({ uid: 'm1', walletBalance: 100, membershipStatus: 'expired' });
    members.save.mockImplementation(async (member: object) => member);
    packages.getByIdOrThrow.mockResolvedValue({ id: 'p1', name: '1 Aylık', price: 1500, durationDays: 30, status: 'active' });
    service = new GymCommerceService(store as never, members as never, accessSync as never, packages as never);
  });

  async function expectCode(promise: Promise<unknown>, code: string) {
    await expect(promise).rejects.toBeInstanceOf(AppException);
    await promise.catch((error: AppException) => expect(error.code).toBe(code));
  }

  it('requires an explicit member instead of falling back to the caller', async () => {
    await expectCode(service.adjustWallet({ amount: 50 }), ErrorCode.VALIDATION_ERROR);
    expect(members.save).not.toHaveBeenCalled();
  });

  it.each([0, -50, Number.NaN])('rejects a non-positive amount (%s)', async (amount) => {
    await expectCode(service.adjustWallet({ userId: 'm1', amount }), ErrorCode.VALIDATION_ERROR);
    expect(members.save).not.toHaveBeenCalled();
  });

  it('rejects an unknown transaction type', async () => {
    await expectCode(service.adjustWallet({ userId: 'm1', amount: 5, walletType: 'gift' as never }), ErrorCode.VALIDATION_ERROR);
  });

  it('credits a deposit and debits within balance', async () => {
    await service.adjustWallet({ userId: 'm1', amount: 50, walletType: 'deposit' });
    expect(members.save).toHaveBeenLastCalledWith(expect.objectContaining({ walletBalance: 150 }));
    await service.adjustWallet({ userId: 'm1', amount: 40, walletType: 'debit' });
    expect(members.save).toHaveBeenLastCalledWith(expect.objectContaining({ walletBalance: 60 }));
    await expectCode(service.adjustWallet({ userId: 'm1', amount: 400, walletType: 'debit' }), ErrorCode.GYM_WALLET_INSUFFICIENT);
  });

  it('requires a packageId and a target member for package sales', async () => {
    await expectCode(service.purchasePackage({ userId: 'm1', amount: 0, durationDays: 3650 }), ErrorCode.VALIDATION_ERROR);
    await expectCode(service.purchasePackage({ packageId: 'p1' }), ErrorCode.VALIDATION_ERROR);
    expect(members.save).not.toHaveBeenCalled();
  });

  it('takes price, duration and name from the package, not the request body', async () => {
    const before = Date.now();
    const updated = (await service.purchasePackage({
      userId: 'm1',
      packageId: 'p1',
      amount: 1,
      price: 1,
      durationDays: 3650,
      name: 'Bedava',
      paymentMethod: 'cash',
    })) as { packagePrice: number; packageLabel: string; membershipEndsAt: string };
    expect(updated.packagePrice).toBe(1500);
    expect(updated.packageLabel).toBe('1 Aylık');
    const days = (new Date(updated.membershipEndsAt).getTime() - before) / 86_400_000;
    expect(days).toBeGreaterThan(29);
    expect(days).toBeLessThan(31);
    expect(store.create).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ type: 'income', amount: 1500, userId: 'm1' }));
  });

  it('refuses a wallet sale the member cannot afford', async () => {
    await expectCode(service.purchasePackage({ userId: 'm1', packageId: 'p1', paymentMethod: 'wallet' }), ErrorCode.GYM_WALLET_INSUFFICIENT);
    expect(accessSync.syncMemberSafely).not.toHaveBeenCalled();
  });

  it('refuses an inactive package', async () => {
    packages.getByIdOrThrow.mockResolvedValue({ id: 'p1', name: 'Eski', price: 10, durationDays: 30, status: 'archived' });
    await expectCode(service.purchasePackage({ userId: 'm1', packageId: 'p1' }), ErrorCode.GYM_PACKAGE_NOT_FOUND);
  });
});
