import { ErrorCode } from '../../../shared/errors/error-codes';
import { StockLedgerService } from './stock-ledger.service';
import { StockMovement } from './stock-movements/stock-movement.entity';

describe('StockLedgerService', () => {
  const movements = {
    collect: jest.fn(),
    findBySource: jest.fn(),
    create: jest.fn(),
    softDelete: jest.fn(),
  };
  const products = { findById: jest.fn(), findByIds: jest.fn() };
  const stores = { findById: jest.fn(), findByIds: jest.fn() };
  let service: StockLedgerService;

  beforeEach(() => {
    jest.resetAllMocks();
    movements.findBySource.mockResolvedValue([]);
    movements.collect.mockResolvedValue([]);
    stores.findById.mockResolvedValue({ id: 's1', name: 'Ana depo' });
    products.findByIds.mockResolvedValue(new Map());
    stores.findByIds.mockResolvedValue(new Map());
    service = new StockLedgerService(movements as never, products as never, stores as never);
  });

  it('writes outbound lines for stockable products and skips services', async () => {
    products.findById.mockImplementation(async (id: string) =>
      id === 'svc'
        ? { id, productType: 'service', storeId: 's1', name: 'Muayene' }
        : { id, productType: 'product', storeId: 's1', name: 'Aşı' },
    );
    movements.collect.mockResolvedValue([
      movement({ productId: 'p1', storeId: 's1', direction: 'in', quantity: 5 }),
    ]);
    await service.apply({ type: 'sale', id: 'sale-1' }, 'out', 'sale', [
      { productId: 'p1', quantity: 2, date: '2026-01-01T00:00:00.000Z' },
      { productId: 'svc', quantity: 1, date: '2026-01-01T00:00:00.000Z' },
    ]);
    expect(movements.create).toHaveBeenCalledTimes(1);
    expect(movements.create).toHaveBeenCalledWith(
      expect.objectContaining({ productId: 'p1', quantity: 2, direction: 'out', reason: 'sale' }),
      { type: 'sale', id: 'sale-1' },
    );
  });

  it('rejects an outbound movement when on-hand is not enough', async () => {
    products.findById.mockResolvedValue({ id: 'p1', productType: 'product', storeId: 's1', name: 'Aşı' });
    movements.collect.mockResolvedValue([
      movement({ productId: 'p1', storeId: 's1', direction: 'in', quantity: 1 }),
    ]);
    await expect(
      service.apply({ type: 'sale', id: 'sale-1' }, 'out', 'sale', [
        { productId: 'p1', quantity: 2, date: '2026-01-01T00:00:00.000Z' },
      ]),
    ).rejects.toMatchObject({ code: ErrorCode.STOCK_INSUFFICIENT });
    expect(movements.create).not.toHaveBeenCalled();
  });
});

function movement(fields: Partial<StockMovement>): StockMovement {
  return {
    id: 'm1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'u',
    updatedBy: 'u',
    deletedAt: null,
    date: '2026-01-01T00:00:00.000Z',
    productId: 'p1',
    storeId: 's1',
    direction: 'in',
    reason: 'purchase',
    quantity: 1,
    unitPrice: null,
    remark: null,
    source: { type: 'manual', id: 'm1' },
    ...fields,
  };
}
