import { ValidationPipe } from '@nestjs/common';
import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { CreateMemberDto, UpdateMemberDto } from '../members/member.dto';
import { GymMember } from '../members/member.entity';
import { MembersService } from '../members/members.service';
import { addMonths, gymToday } from './receivables.math';
import { GymReceivable, GymReceivablesService } from './receivables.service';

/**
 * In-memory stand-ins for the member record, the store and a Firestore transaction, so the wallet
 * balance and the plan can be followed through sale → payments → cancel.
 */
function harness(price = 3000) {
  const member = { uid: 'm1', displayName: 'Ayşe', memberNumber: '1001', phone: '555', walletBalance: 0, packageLabel: null } as unknown as GymMember;
  const state = { member: { ...member }, plans: new Map<string, GymReceivable>(), created: [] as { name: string; fields: Record<string, unknown> }[] };
  const store = {
    userId: () => 'staff-1',
    create: jest.fn(async (name: string, fields: Record<string, unknown>) => {
      const doc = { id: `doc${state.created.length}`, createdAt: 'c', deletedAt: null, ...fields };
      state.created.push({ name, fields: doc });
      if (name === 'gymReceivables') state.plans.set(doc.id, doc as unknown as GymReceivable);
      return doc;
    }),
    getOrThrow: jest.fn(async (_name: string, id: string) => state.plans.get(id)),
    update: jest.fn(async (_name: string, id: string, _code: string, _msg: string, patch: object) => {
      const next = { ...state.plans.get(id)!, ...patch };
      state.plans.set(id, next);
      return next;
    }),
    collection: () => ({
      doc: (id: string) => ({
        firestore: {
          runTransaction: async (fn: (tx: unknown) => unknown) =>
            fn({
              get: async () => ({ exists: true, data: () => state.plans.get(id) }),
              set: (_ref: unknown, value: GymReceivable) => state.plans.set(id, value),
            }),
        },
      }),
    }),
  };
  const members = {
    getByIdOrThrow: jest.fn(async () => state.member),
    save: jest.fn(async (next: GymMember) => {
      state.member = next;
      return next;
    }),
  };
  const packages = {
    getByIdOrThrow: jest.fn(async () => ({ id: 'p1', name: '3 Aylık', price, durationDays: 90, status: 'active' })),
  };
  const commerce = { adjustWallet: jest.fn() };
  const service = new GymReceivablesService(store as never, members as never, packages as never, { syncMemberSafely: jest.fn() } as never, commerce as never);
  const income = () => state.created.filter((c) => c.name === 'gymAccountingEntries').map((c) => c.fields['amount']);
  const walletTx = () => state.created.filter((c) => c.name === 'gymWalletTx').map((c) => [c.fields['type'], c.fields['amount']]);
  return { service, state, member, income, walletTx, commerce, packages };
}

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toBeInstanceOf(AppException);
  await promise.catch((error: AppException) => expect(error.code).toBe(code));
}

describe('opening sale (new member with a package)', () => {
  it('books the paid part, puts the rest on a wallet-linked plan and a negative wallet', async () => {
    const h = harness();
    const updated = await h.service.openingSale(h.member, { packageId: 'p1', paidAmount: 1000, paymentMethod: 'card' });
    expect(updated).toMatchObject({ packageLabel: '3 Aylık', packagePrice: 3000, walletBalance: -2000 });
    expect(h.income()).toEqual([1000]);
    expect(h.walletTx()).toEqual([['debit', 2000]]);
    const [plan] = [...h.state.plans.values()];
    expect(plan).toMatchObject({
      walletLinked: true,
      totalAmount: 3000,
      downPayment: 1000,
      remainingAmount: 2000,
      installmentCount: 1,
      status: 'open',
    });
    expect(plan.installments).toEqual([expect.objectContaining({ amount: 2000, dueDate: addMonths(gymToday(), 1) })]);
  });

  it('a later payment clears debt and wallet together, without counting the money twice', async () => {
    const h = harness();
    await h.service.openingSale(h.member, { packageId: 'p1', paidAmount: 1000 });
    const planId = [...h.state.plans.keys()][0];

    await h.service.recordPayment(planId, { amount: 500, paymentMethod: 'cash' });
    expect(h.state.member.walletBalance).toBe(-1500);
    expect(h.state.plans.get(planId)).toMatchObject({ remainingAmount: 1500, status: 'open' });

    const closed = await h.service.recordPayment(planId, { amount: 1500, paymentMethod: 'transfer' });
    expect(closed.status).toBe('paid');
    expect(h.state.member.walletBalance).toBe(0);
    expect(h.income()).toEqual([1000, 500, 1500]);
    expect(h.walletTx()).toEqual([['debit', 2000], ['deposit', 500], ['deposit', 1500]]);
    expect(h.commerce.adjustWallet).not.toHaveBeenCalled();
  });

  it('refuses to pay a wallet-linked debt from the wallet', async () => {
    const h = harness();
    await h.service.openingSale(h.member, { packageId: 'p1', paidAmount: 0 });
    const planId = [...h.state.plans.keys()][0];
    await expectCode(h.service.recordPayment(planId, { amount: 100, paymentMethod: 'wallet' }), ErrorCode.VALIDATION_ERROR);
    expect(h.state.member.walletBalance).toBe(-3000);
    expect(h.income()).toEqual([]);
  });

  it('cancelling the plan removes the remaining debt from the wallet', async () => {
    const h = harness();
    await h.service.openingSale(h.member, { packageId: 'p1', paidAmount: 1000 });
    const planId = [...h.state.plans.keys()][0];
    await h.service.recordPayment(planId, { amount: 500, paymentMethod: 'cash' });
    await h.service.cancel(planId, {});
    expect(h.state.member.walletBalance).toBe(0);
    expect(h.walletTx().at(-1)).toEqual(['refund', 1500]);
  });

  it('keeps any prior wallet credit separate from the debt', async () => {
    const h = harness();
    h.state.member = { ...h.state.member, walletBalance: 250 };
    await h.service.openingSale(h.state.member, { packageId: 'p1', paidAmount: 2000 });
    expect(h.state.member.walletBalance).toBe(-750);
  });

  it('full payment: income only, no plan, wallet untouched', async () => {
    const h = harness();
    const updated = await h.service.openingSale(h.member, { packageId: 'p1' });
    expect(h.income()).toEqual([3000]);
    expect(h.state.plans.size).toBe(0);
    expect(updated.walletBalance).toBe(0);
  });

  it('custom package: the typed price is income, never debt', async () => {
    const h = harness();
    await h.service.openingSale({ ...h.member, packageLabel: 'Özel Süre' }, { customPrice: 1000, paymentMethod: 'cash' });
    expect(h.income()).toEqual([1000]);
    expect(h.state.plans.size).toBe(0);
    expect(h.packages.getByIdOrThrow).not.toHaveBeenCalled();
  });

  it.each([
    [{ paidAmount: 3000.01 }, 'between 0 and the package price'],
    [{ paidAmount: 100, firstDueDate: '2020-01-01' }, 'firstDueDate'],
  ])('rejects %j', async (overrides, message) => {
    const h = harness();
    await expect(h.service.assertOpeningSale({ packageId: 'p1', ...overrides })).rejects.toThrow(message);
  });
});

describe('MembersService.create with a package', () => {
  const created = { uid: 'm1', walletBalance: 0 } as GymMember;

  function setup() {
    const repo = { create: jest.fn(async () => created) };
    const receivables = { assertOpeningSale: jest.fn(), openingSale: jest.fn(async (m: GymMember) => ({ ...m, walletBalance: -2000 })) };
    const moduleRef = { get: jest.fn(() => receivables) };
    const service = new MembersService(repo as never, { syncMemberSafely: jest.fn() } as never, moduleRef as never);
    return { service, repo, receivables };
  }

  it('validates the sale before creating the login, then settles it', async () => {
    const { service, repo, receivables } = setup();
    const result = await service.create({
      membershipStatus: 'active',
      packageId: 'p1',
      packagePrice: 3000,
      paidAmount: 1000,
      paymentMethod: 'card',
      debtDueDate: '2099-01-15',
      debtInstallments: 2,
    } as CreateMemberDto);
    const sale = { packageId: 'p1', paidAmount: 1000, customPrice: null, paymentMethod: 'card', installmentCount: 2, firstDueDate: '2099-01-15' };
    expect(receivables.assertOpeningSale).toHaveBeenCalledWith(sale);
    expect(receivables.assertOpeningSale.mock.invocationCallOrder[0]).toBeLessThan(repo.create.mock.invocationCallOrder[0]);
    expect(receivables.openingSale).toHaveBeenCalledWith(created, sale);
    expect(result.walletBalance).toBe(-2000);
  });

  it('does not create the member when the sale is invalid', async () => {
    const { service, repo, receivables } = setup();
    receivables.assertOpeningSale.mockRejectedValue(new AppException(ErrorCode.VALIDATION_ERROR, 'paidAmount must be between 0 and the package price'));
    await expect(service.create({ membershipStatus: 'active', packageId: 'p1', paidAmount: 9999 } as CreateMemberDto)).rejects.toThrow('paidAmount');
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('sells nothing for trial members', async () => {
    const { service, receivables } = setup();
    await service.create({ membershipStatus: 'trial', packageId: 'p1', paidAmount: 0 } as CreateMemberDto);
    expect(receivables.openingSale).not.toHaveBeenCalled();
  });
});

describe('member DTOs', () => {
  const pipe = new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true });
  const base = { displayName: 'Ayşe', email: 'a@b.com', password: 'secret123' };

  it('accepts the sale fields on create only', async () => {
    await expect(
      pipe.transform({ ...base, packageId: 'p1', paidAmount: 1000, paymentMethod: 'cash', debtDueDate: '2099-01-01', debtInstallments: 3 }, { type: 'body', metatype: CreateMemberDto }),
    ).resolves.toBeDefined();
    await expect(pipe.transform({ ...base, paidAmount: -1 }, { type: 'body', metatype: CreateMemberDto })).rejects.toBeDefined();
    await expect(pipe.transform({ ...base, paymentMethod: 'wallet' }, { type: 'body', metatype: CreateMemberDto })).rejects.toBeDefined();
    await expect(pipe.transform({ paidAmount: 1000 }, { type: 'body', metatype: UpdateMemberDto })).rejects.toBeDefined();
  });
});
