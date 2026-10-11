import { RfqsService } from './rfqs.service';

describe('RfqsService', () => {
  let service: RfqsService;
  let repoMock: any;
  let approvalsMock: any;
  let ordersMock: any;

  beforeEach(() => {
    repoMock = {
      create: jest.fn().mockImplementation((dto) => Promise.resolve({ id: 'rfq-1', bids: [], ...dto })),
      getByIdOrThrow: jest.fn(),
      collect: jest.fn().mockResolvedValue([]),
      saveRaw: jest.fn().mockImplementation((item) => Promise.resolve(item)),
      softDelete: jest.fn().mockResolvedValue(undefined),
    };
    approvalsMock = {
      submit: jest.fn().mockResolvedValue({ id: 'app-1', status: 'pending' }),
    };
    ordersMock = {
      create: jest.fn().mockResolvedValue({ id: 'po-1', orderNo: 'SIP-001' }),
    };
    service = new RfqsService(repoMock, approvalsMock, ordersMock);
  });

  it('should evaluate bids side-by-side with weighted scorecards', async () => {
    const mockRfq: any = {
      id: 'rfq-1',
      title: 'Aşı Alımı',
      bids: [
        {
          id: 'b-1',
          supplierName: 'Depo A',
          grandTotal: 10000,
          deliveryDays: 1,
          paymentTermDays: 30,
          shippingIncluded: true,
        },
        {
          id: 'b-2',
          supplierName: 'Depo B',
          grandTotal: 12000,
          deliveryDays: 3,
          paymentTermDays: 60,
          shippingIncluded: true,
        },
      ],
    };

    service.recalculateScores(mockRfq);
    expect(mockRfq.bids[0].scoreBreakdown.priceScore).toBe(100);
    expect(mockRfq.bids[1].scoreBreakdown.priceScore).toBeLessThan(100);
    expect(mockRfq.bids[0].scoreBreakdown.totalWeightedScore).toBeGreaterThan(0);
  });

  it('should award winning bid and submit to approvals', async () => {
    const mockRfq: any = {
      id: 'rfq-1',
      rfqNo: 'TEK-001',
      title: 'Aşı Alımı',
      bids: [
        { id: 'b-1', supplierId: 's-1', supplierName: 'Depo A', grandTotal: 10000, deliveryDays: 1, paymentTermDays: 30, shippingIncluded: true, lines: [] },
      ],
    };
    repoMock.getByIdOrThrow.mockResolvedValue(mockRfq);

    const res = await service.awardBid('rfq-1', { bidId: 'b-1', reason: 'En iyi teklif' });
    expect(res.awardedBidId).toBe('b-1');
    expect(approvalsMock.submit).toHaveBeenCalled();
  });
});
