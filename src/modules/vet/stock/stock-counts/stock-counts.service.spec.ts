import { ErrorCode } from '../../../../shared/errors/error-codes';
import { StockCountsService } from './stock-counts.service';

describe('StockCountsService', () => {
  const counts = { create: jest.fn(), save: jest.fn(), getByIdOrThrow: jest.fn(), softDelete: jest.fn() };
  const ledger = { onHandMap: jest.fn() };
  const movements = { create: jest.fn() };
  const products = { collect: jest.fn(), findByIds: jest.fn() };
  const stores = { findById: jest.fn(), findByIds: jest.fn() };
  const tenant = { getUserId: () => 'u1' };
  let service: StockCountsService;

  beforeEach(() => {
    jest.resetAllMocks();
    stores.findById.mockResolvedValue({ id: 's1', name: 'Ana Depo' });
    products.findByIds.mockResolvedValue(new Map());
    counts.create.mockImplementation(async (fields) => ({ id: 'c1', ...fields }));
    counts.save.mockImplementation(async (item) => item);
    service = new StockCountsService(
      counts as never,
      ledger as never,
      movements as never,
      products as never,
      stores as never,
      tenant as never,
    );
  });

  it('snapshots stocked products of the store and skips services', async () => {
    products.collect.mockResolvedValue([
      { id: 'p1', productType: 'product', storeId: 's1' },
      { id: 'p2', productType: 'product', storeId: 's2' },
      { id: 'p3', productType: 'product', storeId: 's2' },
      { id: 'svc', productType: 'service', storeId: 's1' },
    ]);
    ledger.onHandMap.mockResolvedValue(new Map([['p1:s1', 4], ['p3:s1', 2]]));
    const view = await service.create({ storeId: 's1', date: '2026-10-29' });
    expect(view.lines.map((line) => [line.productId, line.systemQuantity])).toEqual([
      ['p1', 4],
      ['p3', 2],
    ]);
  });

  it('books differences against on-hand at apply time and skips uncounted lines', async () => {
    counts.getByIdOrThrow.mockResolvedValue({
      id: 'c1',
      storeId: 's1',
      date: '2026-10-29',
      status: 'draft',
      lines: [
        { productId: 'p1', systemQuantity: 10, countedQuantity: 7, difference: -3 },
        { productId: 'p2', systemQuantity: 1, countedQuantity: 3, difference: 2 },
        { productId: 'p3', systemQuantity: 5, countedQuantity: null, difference: null },
      ],
    });
    // One unit of p1 was sold after the sheet was created.
    ledger.onHandMap.mockResolvedValue(new Map([['p1:s1', 9], ['p2:s1', 1], ['p3:s1', 5]]));
    const view = await service.apply('c1');
    expect(movements.create).toHaveBeenCalledTimes(2);
    expect(movements.create).toHaveBeenCalledWith(
      expect.objectContaining({ productId: 'p1', direction: 'out', quantity: 2, reason: 'adjustment' }),
      { type: 'count', id: 'c1' },
    );
    expect(movements.create).toHaveBeenCalledWith(
      expect.objectContaining({ productId: 'p2', direction: 'in', quantity: 2 }),
      { type: 'count', id: 'c1' },
    );
    expect(view.status).toBe('applied');
  });

  it('does not change an applied count', async () => {
    counts.getByIdOrThrow.mockResolvedValue({ id: 'c1', status: 'applied', lines: [] });
    await expect(service.update('c1', { lines: [] })).rejects.toMatchObject({ code: ErrorCode.INVALID_STATUS });
  });
});
