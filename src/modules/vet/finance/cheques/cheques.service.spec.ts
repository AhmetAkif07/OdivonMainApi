import { ErrorCode } from '../../../../shared/errors/error-codes';
import { ChequesService } from './cheques.service';

describe('ChequesService', () => {
  const cheques = { create: jest.fn(), save: jest.fn(), getByIdOrThrow: jest.fn(), collect: jest.fn() };
  const customers = { findById: jest.fn(), findByIds: jest.fn() };
  const suppliers = { findById: jest.fn(), findByIds: jest.fn() };
  const collections = { create: jest.fn() };
  const tenant = { getUserId: () => 'u1' };
  let service: ChequesService;

  beforeEach(() => {
    jest.resetAllMocks();
    customers.findById.mockResolvedValue({ id: 'c1' });
    customers.findByIds.mockResolvedValue(new Map([['c1', { firstName: 'Ayşe', lastName: 'Kaya' }]]));
    suppliers.findByIds.mockResolvedValue(new Map());
    cheques.create.mockImplementation(async (fields) => ({ id: 'ch1', ...fields }));
    cheques.save.mockImplementation(async (item) => item);
    service = new ChequesService(
      cheques as never,
      customers as never,
      suppliers as never,
      collections as never,
      tenant as never,
    );
  });

  it('puts a received cheque into the portfolio and requires a customer', async () => {
    const created = await service.create({
      kind: 'cheque',
      direction: 'received',
      customerId: 'c1',
      amount: 5000,
      issueDate: '2026-10-29',
      dueDate: '2026-12-01',
    });
    expect(created.status).toBe('portfolio');
    customers.findById.mockResolvedValue(null);
    await expect(
      service.create({ kind: 'cheque', direction: 'received', amount: 1, issueDate: '2026-10-29', dueDate: '2026-10-29' }),
    ).rejects.toMatchObject({ code: ErrorCode.FINANCE_INVALID });
  });

  it('writes a collection when a received cheque is collected', async () => {
    cheques.getByIdOrThrow.mockResolvedValue(cheque({ status: 'deposited' }));
    collections.create.mockResolvedValue({ id: 'col1' });
    const updated = await service.changeStatus('ch1', { status: 'collected', cashRegisterId: 'r1' });
    expect(collections.create).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'collection', customerId: 'c1', amount: 5000, cashRegisterId: 'r1' }),
    );
    expect(updated).toMatchObject({ status: 'collected', collectionId: 'col1' });
    expect(updated.history).toHaveLength(2);
  });

  it('rejects a transition that is not allowed', async () => {
    cheques.getByIdOrThrow.mockResolvedValue(cheque({ status: 'collected' }));
    await expect(service.changeStatus('ch1', { status: 'bounced' })).rejects.toMatchObject({
      code: ErrorCode.INVALID_STATUS,
    });
  });

  it('groups open items by due day and sums overdue ones separately', async () => {
    cheques.collect.mockResolvedValue([
      cheque({ id: 'a', dueDate: '2026-11-05', amount: 1000 }),
      cheque({ id: 'b', dueDate: '2026-11-05', amount: 500, direction: 'issued', status: 'issued', customerId: null, supplierId: 's1' }),
      cheque({ id: 'c', dueDate: '2026-10-01', amount: 300 }),
      cheque({ id: 'd', dueDate: '2026-11-10', amount: 999, status: 'collected' }),
    ]);
    const calendar = await service.calendar({ from: '2026-11-01', to: '2026-11-30' });
    expect(calendar).toMatchObject({ totalIncoming: 1000, totalOutgoing: 500, overdueIncoming: 300 });
    expect(calendar.days).toHaveLength(1);
    expect(calendar.days[0]).toMatchObject({ date: '2026-11-05', incoming: 1000, outgoing: 500 });
  });
});

function cheque(fields: Record<string, unknown>) {
  return {
    id: 'ch1',
    kind: 'cheque',
    direction: 'received',
    customerId: 'c1',
    supplierId: null,
    amount: 5000,
    issueDate: '2026-10-01',
    dueDate: '2026-12-01',
    serialNo: '0012345',
    status: 'portfolio',
    collectionId: null,
    history: [{ status: 'portfolio', at: '2026-10-01', by: 'u1', remark: null }],
    ...fields,
  };
}
