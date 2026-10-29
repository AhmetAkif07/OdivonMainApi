import { ErrorCode } from '../../../../shared/errors/error-codes';
import { buildCashSessionSummary } from './cash-session.summary';
import { CashSessionsService } from './cash-sessions.service';

const from = '2026-10-29T08:00:00.000Z';
const to = '2026-10-29T20:00:00.000Z';

describe('buildCashSessionSummary', () => {
  it('adds cash sales and collections, subtracts payments and outflows, and skips open-account sales', () => {
    const summary = buildCashSessionSummary({
      cashRegisterId: 'r1',
      openingAmount: 500,
      from,
      to,
      paymentMethodNames: new Map([
        ['cash', 'Nakit'],
        ['card', 'Kredi Kartı'],
        ['pm-veresiye', 'Cari Hesap (Veresiye)'],
      ]),
      sales: [
        sale({ total: 1000, paymentMethodId: 'cash' }),
        sale({ total: 300, paymentMethodId: 'card' }),
        sale({ total: 700, paymentMethodId: 'pm-veresiye' }),
        sale({ total: 200, paymentMethodId: 'cash', type: 'purchase' }),
        sale({ total: 999, paymentMethodId: 'cash', cashRegisterId: 'other' }),
        sale({ total: 999, paymentMethodId: 'cash', createdAt: '2026-10-28T10:00:00.000Z' }),
      ],
      collections: [
        collection({ kind: 'collection', amount: 150, paymentMethodId: 'cash' }),
        collection({ kind: 'payment', amount: 50, paymentMethodId: 'cash' }),
      ],
      movements: [movement({ direction: 'in', amount: 20 }), movement({ direction: 'out', amount: 70 })],
    });

    expect(summary).toMatchObject({
      salesIn: 1300,
      creditSales: 700,
      purchasesOut: 200,
      collectionsIn: 150,
      paymentsOut: 50,
      movementsIn: 20,
      movementsOut: 70,
      saleCount: 3,
      expectedAmount: 500 + 1300 + 150 + 20 - 200 - 50 - 70,
    });
    const veresiye = summary.byPaymentMethod.find((item) => item.paymentMethodId === 'pm-veresiye');
    expect(veresiye).toMatchObject({ incoming: 700, countsAsCash: false });
  });
});

describe('CashSessionsService', () => {
  const sessions = { findOpen: jest.fn(), open: jest.fn(), getByIdOrThrow: jest.fn(), close: jest.fn() };
  const registers = { findById: jest.fn() };
  const empty = { collect: jest.fn().mockResolvedValue([]) };
  let service: CashSessionsService;

  beforeEach(() => {
    jest.clearAllMocks();
    registers.findById.mockResolvedValue({ id: 'r1', name: 'Ana Kasa' });
    service = new CashSessionsService(
      sessions as never,
      registers as never,
      empty as never,
      empty as never,
      empty as never,
      empty as never,
    );
  });

  it('refuses to open a register that already has an open session', async () => {
    sessions.findOpen.mockResolvedValue({ id: 's1', status: 'open' });
    await expect(service.open({ cashRegisterId: 'r1', openingAmount: 0 })).rejects.toMatchObject({
      code: ErrorCode.CASH_SESSION_CONFLICT,
    });
    expect(sessions.open).not.toHaveBeenCalled();
  });

  it('refuses to close a session twice', async () => {
    sessions.getByIdOrThrow.mockResolvedValue({ id: 's1', status: 'closed' });
    await expect(service.close('s1', { countedAmount: 10 })).rejects.toMatchObject({
      code: ErrorCode.INVALID_STATUS,
    });
  });

  it('closes with the computed expected amount', async () => {
    sessions.getByIdOrThrow.mockResolvedValue({
      id: 's1',
      status: 'open',
      cashRegisterId: 'r1',
      openingAmount: 250,
      openedAt: '2000-01-01T00:00:00.000Z',
    });
    sessions.close.mockImplementation(async (current, input) => ({ ...current, ...input, status: 'closed' }));
    const result = await service.close('s1', { countedAmount: 240 });
    expect(sessions.close.mock.calls[0][1].summary.expectedAmount).toBe(250);
    expect(result.report.expectedAmount).toBe(250);
  });
});

function sale(fields: Record<string, unknown>) {
  return { type: 'sale', cashRegisterId: 'r1', createdAt: '2026-10-29T10:00:00.000Z', ...fields } as never;
}
function collection(fields: Record<string, unknown>) {
  return { cashRegisterId: 'r1', createdAt: '2026-10-29T11:00:00.000Z', ...fields } as never;
}
function movement(fields: Record<string, unknown>) {
  return { cashRegisterId: 'r1', createdAt: '2026-10-29T12:00:00.000Z', ...fields } as never;
}
