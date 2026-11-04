import { addDaysToDate, buildDayEnd, DayEndInput, localDay, receivableBalances } from './day-end.logic';
import { InsightsService } from './insights.service';

const DAY = '2026-11-04';

function input(overrides: Partial<DayEndInput> = {}): DayEndInput {
  return {
    date: DAY,
    utcOffsetMinutes: 180,
    now: new Date('2026-11-04T20:00:00.000Z'), // 23:00 in Türkiye
    sales: [],
    collections: [],
    appointments: [],
    customers: [],
    cashSessions: [],
    stock: [],
    cheques: [],
    creditMethods: new Set(['pm-veresiye']),
    ...overrides,
  };
}

const codes = (report: { findings: { code: string; severity: string }[] }) =>
  report.findings.map((f) => `${f.severity}:${f.code}`);

describe('day-end logic', () => {
  it('maps stored dates to the clinic day', () => {
    expect(localDay('2026-11-03T22:30:00.000Z', 180)).toBe('2026-11-04');
    expect(localDay('2026-11-04', 180)).toBe('2026-11-04');
    expect(localDay(null, 180)).toBeNull();
  });

  it('splits cash and credit sales and compares with the 7-day average', () => {
    const sales = [
      { type: 'sale', date: '2026-11-04T09:00:00.000Z', total: 600, customerId: 'c1', paymentMethodId: 'pm-veresiye' },
      { type: 'sale', date: '2026-11-04T10:00:00.000Z', total: 400, customerId: 'c2', paymentMethodId: 'pm-cash' },
      { type: 'purchase', date: '2026-11-04T10:00:00.000Z', total: 999, customerId: null, paymentMethodId: null },
      // 7 previous days, 350 per day
      ...Array.from({ length: 7 }, (_, i) => ({
        type: 'sale',
        date: addDaysToDate(DAY, -(i + 1)),
        total: 350,
        customerId: null,
        paymentMethodId: 'pm-cash',
      })),
    ];
    const report = buildDayEnd(input({ sales }));
    expect(report.metrics).toMatchObject({ salesTotal: 1000, creditSales: 600, cashSales: 400, saleCount: 2 });
    expect(report.comparison.avg7Sales).toBe(350);
    expect(report.comparison.salesChangePct).toBe(186);
    expect(codes(report)).toEqual(expect.arrayContaining(['positive:sales.aboveAverage', 'warning:sales.credit', 'info:receivables']));
    expect(report.metrics.receivablesTotal).toBe(600);
  });

  it('flags stale open tills, negative stock and overdue cheques as critical first', () => {
    const report = buildDayEnd(
      input({
        cashSessions: [
          { status: 'open', openedAt: '2026-11-02T06:00:00.000Z', closedAt: null, difference: null, cashRegisterId: 'r1' },
          { status: 'closed', openedAt: '2026-11-04T06:00:00.000Z', closedAt: '2026-11-04T17:00:00.000Z', difference: -150, cashRegisterId: 'r2' },
        ],
        stock: [
          { productName: 'Mama', storeName: 'Ana', onHand: -2, low: true },
          { productName: 'Aşı', storeName: 'Ana', onHand: 1, low: true },
          { productName: 'Tasma', storeName: 'Ana', onHand: 10, low: false },
        ],
        cheques: [
          { direction: 'received', status: 'portfolio', dueDate: '2026-11-01', amount: 1000 },
          { direction: 'issued', status: 'issued', dueDate: '2026-11-04', amount: 500 },
          { direction: 'received', status: 'collected', dueDate: '2026-10-01', amount: 300 },
          { direction: 'received', status: 'portfolio', dueDate: '2026-11-09', amount: 200 },
        ],
      }),
    );
    expect(report.metrics).toMatchObject({
      openTillSessions: 1,
      tillDifferences: 1,
      negativeStockItems: 1,
      lowStockItems: 1,
      chequesOverdue: 1,
      chequesOverdueAmount: 1000,
      chequesDueToday: 1,
      chequesDueNext7Days: 1,
    });
    const list = codes(report);
    expect(list.slice(0, 4)).toEqual(
      expect.arrayContaining(['critical:stock.negative', 'critical:cheques.overdue', 'critical:till.open', 'critical:till.difference']),
    );
    expect(list).toEqual(expect.arrayContaining(['warning:cheques.dueToday', 'warning:stock.low', 'info:cheques.dueSoon']));
  });

  it('counts no-shows and appointments left as scheduled', () => {
    const appointments = [
      { beginAt: '2026-11-04T06:00:00.000Z', status: 'completed' },
      { beginAt: '2026-11-04T07:00:00.000Z', status: 'no_show' },
      { beginAt: '2026-11-04T08:00:00.000Z', status: 'scheduled' },
      { beginAt: '2026-11-04T09:00:00.000Z', status: 'cancelled' },
    ];
    const report = buildDayEnd(input({ appointments }));
    expect(report.metrics).toMatchObject({ appointments: 4, completedAppointments: 1, noShows: 1, unresolvedAppointments: 1 });
    expect(codes(report)).toEqual(expect.arrayContaining(['warning:appointments.unresolved', 'warning:appointments.noShow']));
    expect(report.summary).toContain('4 randevunun 1 tanesi tamamlandı');
  });

  it('reports a quiet day without warnings', () => {
    const report = buildDayEnd(input({ customers: [{ id: 'c', createdAt: '2026-11-04T08:00:00.000Z' }] }));
    expect(codes(report)).toEqual(['info:day.quiet', 'positive:customers.new']);
    expect(report.summary).toContain('Dikkat gerektiren bir konu yok');
  });

  it('nets collections against open-account sales up to the day', () => {
    const balances = receivableBalances({
      date: DAY,
      utcOffsetMinutes: 180,
      creditMethods: new Set(['pm-veresiye']),
      sales: [
        { type: 'sale', date: '2026-11-01', total: 500, customerId: 'a', paymentMethodId: 'pm-veresiye' },
        { type: 'sale', date: '2026-11-02', total: 200, customerId: 'b', paymentMethodId: 'pm-veresiye' },
        { type: 'sale', date: '2026-11-05', total: 900, customerId: 'b', paymentMethodId: 'pm-veresiye' },
      ],
      collections: [
        { kind: 'collection', date: '2026-11-03', amount: 200, customerId: 'b' },
        { kind: 'collection', date: '2026-11-03', amount: 100, customerId: 'a' },
      ],
    });
    expect(balances).toEqual([['a', 400]]);
  });
});

describe('InsightsService', () => {
  function collection(docs: Record<string, unknown>[]) {
    const snapshot = { docs: docs.map((data) => ({ data: () => data })) };
    return {
      get: jest.fn().mockResolvedValue(snapshot),
      where: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(snapshot) }),
      doc: jest.fn((id: string) => ({ get: jest.fn().mockResolvedValue({ id, exists: true, data: () => ({ firstName: 'Ali', lastName: 'Veli' }) }) })),
    };
  }

  it('loads the collections and names the top open balance', async () => {
    const data: Record<string, Record<string, unknown>[]> = {
      sales: [{ type: 'sale', date: DAY, total: 300, customerId: 'c1', paymentMethodId: 'pm-veresiye-1' }],
      paymentMethods: [{ id: 'pm-veresiye-1', name: 'Veresiye' }],
    };
    const firebase = { db: { collection: jest.fn((path: string) => collection(data[path.split('/').pop()!] ?? [])) } };
    const tenant = { getTenantId: () => 't1' };
    const ledger = { allBalances: jest.fn().mockResolvedValue([]) };
    const service = new InsightsService(firebase as never, tenant as never, ledger as never);
    const report = await service.dayEnd(DAY);
    expect(report.metrics.creditSales).toBe(300);
    expect(report.findings.find((f) => f.code === 'receivables')?.detail).toContain('Ali Veli');
  });
});
