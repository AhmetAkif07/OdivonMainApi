import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { addMonths, buildSchedule, gymToday } from './receivables.math';
import { GymReceivable, GymReceivablesService } from './receivables.service';

function plan(overrides: Partial<GymReceivable>): GymReceivable {
  return {
    id: 'r1',
    createdAt: '2026-08-01T00:00:00Z',
    updatedAt: '2026-08-01T00:00:00Z',
    createdBy: 'staff',
    updatedBy: 'staff',
    deletedAt: null,
    tenantId: 't1',
    userId: 'm1',
    memberName: 'Ayşe',
    memberNumber: '1001',
    memberPhone: '555',
    packageId: 'p1',
    packageName: '3 Aylık',
    listPrice: 3000,
    discount: 0,
    totalAmount: 3000,
    downPayment: 0,
    financedAmount: 3000,
    installmentCount: 3,
    installments: buildSchedule(3000, 3, '2026-01-10'),
    payments: [],
    paidAmount: 0,
    remainingAmount: 3000,
    status: 'open',
    saleDate: '2026-01-01T00:00:00Z',
    notes: null,
    cancelledAt: null,
    cancelReason: null,
    ...overrides,
  };
}

describe('GymReceivablesService', () => {
  const store = { create: jest.fn(), list: jest.fn(), userId: jest.fn(), getOrThrow: jest.fn(), collection: jest.fn(), update: jest.fn() };
  const members = { getByIdOrThrow: jest.fn(), save: jest.fn() };
  const packages = { getByIdOrThrow: jest.fn() };
  const accessSync = { syncMemberSafely: jest.fn() };
  const commerce = { adjustWallet: jest.fn() };
  let service: GymReceivablesService;

  beforeEach(() => {
    jest.resetAllMocks();
    store.userId.mockReturnValue('staff-1');
    store.create.mockImplementation(async (_name: string, fields: object) => ({ id: 'new', createdAt: 'c', ...fields }));
    members.getByIdOrThrow.mockResolvedValue({
      uid: 'm1',
      displayName: 'Ayşe',
      memberNumber: '1001',
      phone: '555',
      walletBalance: 0,
      membershipStatus: 'expired',
      isArchived: false,
    });
    members.save.mockImplementation(async (member: object) => member);
    packages.getByIdOrThrow.mockResolvedValue({ id: 'p1', name: '3 Aylık', price: 3000, durationDays: 90, status: 'active' });
    service = new GymReceivablesService(
      store as never,
      members as never,
      packages as never,
      accessSync as never,
      commerce as never,
    );
  });

  async function expectCode(promise: Promise<unknown>, code: string) {
    await expect(promise).rejects.toBeInstanceOf(AppException);
    await promise.catch((error: AppException) => expect(error.code).toBe(code));
  }

  describe('createSale', () => {
    it('prices from the package, books the down payment and schedules the rest monthly', async () => {
      const view = await service.createSale({
        userId: 'm1',
        packageId: 'p1',
        downPayment: 1000,
        installmentCount: 2,
        discount: 200,
        paymentMethod: 'card',
      });
      expect(view).toMatchObject({ totalAmount: 2800, downPayment: 1000, financedAmount: 1800, remainingAmount: 1800, status: 'open' });
      const firstDue = addMonths(gymToday(), 1);
      expect(view.installments.map((item) => [item.dueDate, item.amount])).toEqual([
        [firstDue, 900],
        [addMonths(firstDue, 1, Number(firstDue.slice(8))), 900],
      ]);
      expect(members.save).toHaveBeenCalledWith(expect.objectContaining({ membershipStatus: 'active', packagePrice: 2800 }));
      expect(accessSync.syncMemberSafely).toHaveBeenCalled();
      expect(store.create).toHaveBeenCalledWith(
        'gymAccountingEntries',
        expect.objectContaining({ type: 'income', amount: 1000, paymentMethod: 'card', referenceType: 'receivable' }),
      );
      expect(commerce.adjustWallet).not.toHaveBeenCalled();
      // The financed part shows on the wallet as debt (wallet-linked plan).
      expect(view).toMatchObject({ walletLinked: true });
      expect(members.save).toHaveBeenLastCalledWith(expect.objectContaining({ walletBalance: -1800 }));
      expect(store.create).toHaveBeenCalledWith(
        'gymWalletTx',
        expect.objectContaining({ type: 'debit', amount: 1800, referenceType: 'receivable' }),
      );
    });

    it('debits the wallet when the down payment is taken from it', async () => {
      await service.createSale({ userId: 'm1', packageId: 'p1', downPayment: 500, installmentCount: 5, paymentMethod: 'wallet' });
      expect(commerce.adjustWallet).toHaveBeenCalledWith(expect.objectContaining({ userId: 'm1', walletType: 'debit', amount: 500 }));
    });

    it('does not book income when there is no down payment', async () => {
      await service.createSale({ userId: 'm1', packageId: 'p1', downPayment: 0, installmentCount: 3 });
      expect(store.create).not.toHaveBeenCalledWith('gymAccountingEntries', expect.anything());
    });

    it.each([
      [{ downPayment: 3000 }, 'whole price'],
      [{ discount: 3000 }, 'Discount'],
      [{ firstDueDate: '2020-01-01' }, 'firstDueDate'],
      [{ firstDueDate: '2026-02-30' }, 'firstDueDate'],
    ])('rejects %j', async (overrides, message) => {
      const promise = service.createSale({ userId: 'm1', packageId: 'p1', downPayment: 0, installmentCount: 3, ...overrides });
      await expect(promise).rejects.toThrow(message);
      expect(members.save).not.toHaveBeenCalled();
    });

    it('rejects an archived member', async () => {
      members.getByIdOrThrow.mockResolvedValue({ uid: 'm1', isArchived: true });
      await expectCode(service.createSale({ userId: 'm1', packageId: 'p1', downPayment: 0, installmentCount: 3 }), ErrorCode.VALIDATION_ERROR);
    });
  });

  describe('recordPayment', () => {
    function withTransaction(current: GymReceivable) {
      const set = jest.fn();
      store.getOrThrow.mockResolvedValue(current);
      store.collection.mockReturnValue({
        doc: () => ({
          firestore: {
            runTransaction: async (fn: (tx: unknown) => unknown) =>
              fn({ get: async () => ({ exists: true, data: () => current }), set }),
          },
        }),
      });
      return set;
    }

    it('settles the oldest installments, books income and closes the plan when fully paid', async () => {
      const set = withTransaction(plan({}));
      const partial = await service.recordPayment('r1', { amount: 1500, paymentMethod: 'cash' });
      expect(partial.remainingAmount).toBe(1500);
      expect(partial.status).toBe('open');
      expect(partial.installments.map((item) => item.status)).toEqual(['paid', 'partial', 'pending']);
      expect(set).toHaveBeenCalledTimes(1);
      expect(store.create).toHaveBeenCalledWith(
        'gymAccountingEntries',
        expect.objectContaining({ amount: 1500, category: 'installment', paymentMethod: 'cash' }),
      );

      withTransaction(plan({ installments: buildSchedule(3000, 3, '2026-01-10'), paidAmount: 0 }));
      const full = await service.recordPayment('r1', { amount: 3000, paymentMethod: 'transfer' });
      expect(full.status).toBe('paid');
      expect(full.overdueCount).toBe(0);
    });

    it('rejects overpayment before any money moves', async () => {
      withTransaction(plan({}));
      await expectCode(service.recordPayment('r1', { amount: 3000.01, paymentMethod: 'wallet' }), ErrorCode.VALIDATION_ERROR);
      expect(commerce.adjustWallet).not.toHaveBeenCalled();
    });

    it('refunds the wallet when the plan changed under the payment', async () => {
      const current = plan({});
      store.getOrThrow.mockResolvedValue(current);
      store.collection.mockReturnValue({
        doc: () => ({
          firestore: {
            runTransaction: async (fn: (tx: unknown) => unknown) =>
              fn({ get: async () => ({ exists: true, data: () => ({ ...current, status: 'cancelled' }) }), set: jest.fn() }),
          },
        }),
      });
      await expectCode(service.recordPayment('r1', { amount: 100, paymentMethod: 'wallet' }), ErrorCode.GYM_RECEIVABLE_CLOSED);
      expect(commerce.adjustWallet.mock.calls.map(([dto]) => dto.walletType)).toEqual(['debit', 'refund']);
    });

    it('refuses payments on a cancelled plan', async () => {
      withTransaction(plan({ status: 'cancelled' }));
      await expectCode(service.recordPayment('r1', { amount: 100, paymentMethod: 'cash' }), ErrorCode.GYM_RECEIVABLE_CLOSED);
    });
  });

  describe('reports', () => {
    it('aggregates debt per member and lists overdue installments', async () => {
      store.list.mockResolvedValue([
        plan({ id: 'r1', installments: buildSchedule(3000, 3, '2026-01-10') }),
        plan({ id: 'r2', packageName: 'PT', installments: buildSchedule(600, 2, '2099-01-01') }),
        plan({ id: 'r3', userId: 'm2', memberName: 'Can', installments: buildSchedule(500, 1, '2099-05-05') }),
        plan({ id: 'r4', userId: 'm3', status: 'cancelled' }),
        plan({ id: 'r5', userId: 'm4', status: 'paid' }),
      ]);
      const debtors = await service.debtors();
      expect(debtors.map((row) => row.userId)).toEqual(['m1', 'm2']);
      expect(debtors[0]).toMatchObject({ openPlans: 2, totalDebt: 3600, overdueAmount: 3000, overdueCount: 3, nextDueDate: '2026-01-10' });
      expect(debtors[1]).toMatchObject({ totalDebt: 500, overdueAmount: 0, maxDaysLate: 0, nextDueDate: '2099-05-05' });

      const overdue = await service.overdue();
      expect(overdue.map((row) => [row.receivableId, row.installmentNo])).toEqual([
        ['r1', 1],
        ['r1', 2],
        ['r1', 3],
      ]);
      expect(overdue[0].daysLate).toBeGreaterThan(overdue[2].daysLate);
    });

    it('shows a member only their own non-cancelled plans', async () => {
      store.list.mockResolvedValue([plan({ id: 'a' }), plan({ id: 'b', userId: 'm2' }), plan({ id: 'c', status: 'cancelled' })]);
      expect((await service.forMember('m1')).map((item) => item.id)).toEqual(['a']);
    });
  });
});
