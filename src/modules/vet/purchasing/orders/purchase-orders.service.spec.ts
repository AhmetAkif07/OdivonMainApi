import { PurchaseOrdersService } from './purchase-orders.service';

describe('PurchaseOrdersService', () => {
  let service: PurchaseOrdersService;
  let repoMock: any;
  let approvalsMock: any;
  let movementsMock: any;
  let tenantContextMock: any;

  beforeEach(() => {
    repoMock = {
      create: jest.fn().mockImplementation((dto) => Promise.resolve({ id: 'po-1', ...dto, receiptHistory: [] })),
      getByIdOrThrow: jest.fn(),
      collect: jest.fn().mockResolvedValue([]),
      saveRaw: jest.fn().mockImplementation((item) => Promise.resolve(item)),
      softDelete: jest.fn().mockResolvedValue(undefined),
    };
    approvalsMock = {
      submit: jest.fn().mockResolvedValue({ id: 'app-1', status: 'approved' }),
    };
    movementsMock = {
      create: jest.fn().mockResolvedValue({ id: 'mov-1' }),
    };
    tenantContextMock = {
      getUserId: () => 'user-1',
    };
    service = new PurchaseOrdersService(repoMock, approvalsMock, movementsMock, tenantContextMock);
  });

  it('should receive goods and update order status and stock ledger', async () => {
    const mockOrder: any = {
      id: 'po-1',
      orderNo: 'SIP-001',
      lines: [
        { productId: 'p-1', productName: 'Nobivac', orderedQuantity: 50, receivedQuantity: 0, unitPrice: 200 },
      ],
      receiptHistory: [],
    };
    repoMock.getByIdOrThrow.mockResolvedValue(mockOrder);

    const res = await service.receiveGoods('po-1', {
      receiptDate: '2026-10-11',
      invoiceNo: 'FAT-99',
      storeId: 'store-1',
      receivedLines: [{ productId: 'p-1', quantity: 50, batchNo: 'LT-1' }],
    });

    expect(res.lines[0].receivedQuantity).toBe(50);
    expect(res.status).toBe('received');
    expect(movementsMock.create).toHaveBeenCalled();
  });
});
