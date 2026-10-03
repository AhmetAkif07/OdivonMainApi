import { checkInsByDay, financeByMonth, lastDays, memberStatus, salesByDay } from './dashboard-summary.math';
import { GymReportsService } from './reports.service';

describe('dashboard summary', () => {
  const days = lastDays('2026-09-20', 3);

  it('gives the last days oldest first', () => {
    expect(days).toEqual(['2026-09-18', '2026-09-19', '2026-09-20']);
  });

  it('counts passed entries per gym-local day', () => {
    const result = checkInsByDay(
      [
        { status: 'granted', direction: 'in', timestamp: '2026-09-18T22:30:00Z' }, // 19th in Istanbul
        { status: 'granted', direction: 'out', timestamp: '2026-09-19T10:00:00Z' },
        { status: 'denied', direction: 'in', timestamp: '2026-09-19T10:00:00Z' },
        { status: 'unknown', direction: 'in', timestamp: '2026-09-20T10:00:00Z' },
      ],
      days,
    );
    expect(result).toEqual([
      { day: '2026-09-18', count: 0 },
      { day: '2026-09-19', count: 1 },
      { day: '2026-09-20', count: 1 },
    ]);
  });

  it('sums sales per day without refunds', () => {
    const result = salesByDay(
      [
        { totalAmount: 100, saleDate: '2026-09-20T10:00:00Z' },
        { totalAmount: 50, saleDate: '2026-09-20T11:00:00Z', status: 'refunded' },
        { totalAmount: '25.5', saleDate: '2026-09-18T10:00:00Z' },
        { totalAmount: 10, saleDate: 'broken' },
      ],
      days,
    );
    expect(result.map((item) => [item.amount, item.count])).toEqual([
      [25.5, 1],
      [0, 0],
      [100, 1],
    ]);
  });

  it('splits members by their state now', () => {
    const now = new Date('2026-09-20T12:00:00Z');
    expect(
      memberStatus(
        [
          { membershipStatus: 'active', membershipEndsAt: '2026-12-01T00:00:00Z' },
          { membershipStatus: 'active', membershipEndsAt: '2026-09-23T00:00:00Z' },
          { membershipStatus: 'active', membershipEndsAt: '2026-09-01T00:00:00Z' },
          { membershipStatus: 'trial' },
          { membershipStatus: 'cancelled' },
          { membershipStatus: 'active', isArchived: true },
        ],
        now,
      ),
    ).toEqual({ active: 1, expiringSoon: 1, expired: 1, trial: 1, cancelled: 1 });
  });

  it('totals income and expense per month', () => {
    expect(
      financeByMonth(
        [
          { type: 'income', amount: 100, entryDate: '2026-08-10T10:00:00Z' },
          { type: 'expense', amount: 40, entryDate: '2026-09-02T10:00:00Z' },
          { amount: 60, createdAt: '2026-09-03T10:00:00Z' },
          { type: 'income', amount: 1, entryDate: '2025-01-01T10:00:00Z' },
        ],
        ['2026-08', '2026-09'],
      ),
    ).toEqual([
      { month: '2026-08', income: 100, expense: 0 },
      { month: '2026-09', income: 60, expense: 40 },
    ]);
  });

  it('only loads the sections the caller may view', async () => {
    const store = { list: jest.fn().mockResolvedValue([]), collection: jest.fn() };
    const members = { list: jest.fn().mockResolvedValue([]) };
    const service = new GymReportsService(store as never, members as never, { list: jest.fn() } as never);
    const result = await service.dashboard(
      { tenantId: 't', userId: 'u', role: 'user', modules: ['gym'], email: '', permissions: { members: ['view'], shop: ['view'] } },
      new Date('2026-09-20T12:00:00Z'),
    );
    expect(result.members).not.toBeNull();
    expect(result.sales).not.toBeNull();
    expect(result.checkIns).toBeNull();
    expect(result.finance).toBeNull();
    expect(store.collection).not.toHaveBeenCalled();
    expect(store.list).toHaveBeenCalledTimes(1);
  });
});
