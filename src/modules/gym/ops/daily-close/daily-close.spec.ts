import { Test, TestingModule } from '@nestjs/testing';
import { GymDailyCloseService } from './daily-close.service';
import { GymStore } from '../../shared/gym-store';

describe('GymDailyCloseService', () => {
  let service: GymDailyCloseService;
  let mockStore: Partial<GymStore>;
  let dummyEntries: any[] = [];
  let dummyClosings: any[] = [];

  beforeEach(async () => {
    dummyEntries = [
      {
        id: 'e1',
        type: 'income',
        amount: 1500,
        paymentMethod: 'cash',
        referenceType: 'membership',
        entryDate: '2026-10-02T10:00:00.000Z',
      },
      {
        id: 'e2',
        type: 'income',
        amount: 2500,
        paymentMethod: 'posCard',
        referenceType: 'product-sale',
        entryDate: '2026-10-02T11:00:00.000Z',
      },
      {
        id: 'e3',
        type: 'expense',
        amount: 300,
        paymentMethod: 'cash',
        category: 'Temizlik',
        entryDate: '2026-10-02T12:00:00.000Z',
      },
      {
        id: 'e4',
        type: 'expense',
        amount: 1200,
        paymentMethod: 'bankTransfer',
        category: 'Elektrik',
        entryDate: '2026-10-02T14:00:00.000Z',
      },
    ];

    dummyClosings = [
      {
        id: 'z-prev',
        date: '2026-10-01',
        retainedCashForNextDay: 800,
        actualCashCounted: 1500,
        status: 'closed',
      },
    ];

    mockStore = {
      tenantId: () => 'tenant-123',
      list: jest.fn().mockImplementation((collection: string) => {
        if (collection === 'gymDailyClosings') return Promise.resolve(dummyClosings);
        return Promise.resolve(dummyEntries);
      }),
      create: jest.fn().mockImplementation((collection: string, data: any) => {
        const doc = { id: 'new-z-id', tenantId: 'tenant-123', ...data };
        dummyClosings.push(doc);
        return Promise.resolve(doc);
      }),
      update: jest.fn().mockImplementation((collection: string, id: string, _err: any, _msg: any, data: any) => {
        const item = dummyClosings.find((c) => c.id === id);
        if (item) Object.assign(item, data);
        return Promise.resolve(item);
      }),
      getOrThrow: jest.fn().mockImplementation((collection: string, id: string) => {
        const item = dummyClosings.find((c) => c.id === id);
        if (!item) throw new Error('Not found');
        return Promise.resolve(item);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GymDailyCloseService,
        { provide: GymStore, useValue: mockStore },
      ],
    }).compile();

    service = module.get<GymDailyCloseService>(GymDailyCloseService);
  });

  it('should calculate pre-close preview correctly from prior opening float + income - expense', async () => {
    const preview = await service.getPreClosePreview('2026-10-02');
    expect(preview.date).toBe('2026-10-02');
    expect(preview.openingCash).toBe(800); // from 2026-10-01 closing
    expect(preview.incomeSummary.cash).toBe(1500);
    expect(preview.incomeSummary.posCard).toBe(2500);
    expect(preview.incomeSummary.total).toBe(4000);
    expect(preview.expenseSummary.cash).toBe(300);
    expect(preview.expenseSummary.bank).toBe(1200);
    expect(preview.expenseSummary.total).toBe(1500);

    // Expected cash = 800 (open) + 1500 (in cash) - 300 (out cash) = 2000
    expect(preview.expectedCash).toBe(2000);
    expect(preview.expectedPos).toBe(2500);
    expect(preview.isAlreadyClosed).toBe(false);
  });

  it('should submit daily closing and compute cash discrepancy accurately', async () => {
    const result = await service.submitDailyClose({
      date: '2026-10-02',
      actualCashCounted: 1950, // 50 TL shortage
      actualPosCounted: 2500,
      retainedCashForNextDay: 500,
      bankDepositAmount: 1450,
      notes: '50 TL kasa acigi tespit edildi (bozuk para eksigi).',
    });

    expect(result.closingNumber).toBe('Z-20261002-001');
    expect(result.actualCashCounted).toBe(1950);
    expect(result.expectedCash).toBe(2000);
    expect(result.cashDifference).toBe(-50); // Shortage
    expect(result.posDifference).toBe(0);
    expect(result.retainedCashForNextDay).toBe(500);
    expect(result.status).toBe('closed');
  });

  it('should verify closing by manager', async () => {
    const closed = await service.submitDailyClose({
      date: '2026-10-02',
      actualCashCounted: 2000,
    });
    const verified = await service.verifyClosing(closed.id, { id: 'm1', name: 'Ahmet Mudur' });
    expect(verified.status).toBe('verified');
    expect(verified.verifiedByStaffName).toBe('Ahmet Mudur');
  });
});
