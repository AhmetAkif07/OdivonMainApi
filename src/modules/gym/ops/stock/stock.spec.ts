import { ErrorCode } from '../../../../shared/errors/error-codes';
import { applyCounts, countSheet, countSummary, DEFAULT_MIN_STOCK, lowStockItems, orderTotal, suggestedQty } from './stock.math';
import { GymStockService } from './stock.service';

describe('stock math', () => {
  const products = [
    { id: 'a', name: 'Protein', stock: 2, minStock: 10, cost: 300, supplierId: 's1', status: 'active' },
    { id: 'b', name: 'Su', stock: 40, minStock: 24, status: 'active' },
    { id: 'c', name: 'Bar', stock: 5, status: 'active' },
    { id: 'd', name: 'Eski', stock: 0, status: 'inactive' },
    { id: 'e', name: 'Shaker', stock: 1, minStock: 3, reorderQty: 20, supplierId: 's2' },
  ];

  it('lists active products at or below their minimum, most urgent first', () => {
    const low = lowStockItems(products);
    expect(low.map((item) => item.productId)).toEqual(['a', 'e', 'c']);
    expect(low.find((item) => item.productId === 'c')?.minStock).toBe(DEFAULT_MIN_STOCK);
    expect(lowStockItems(products, 's1').map((item) => item.productId)).toEqual(['a']);
  });

  it('suggests the usual order size, else enough to reach twice the minimum', () => {
    expect(suggestedQty(products[0])).toBe(18);
    expect(suggestedQty(products[4])).toBe(20);
    expect(suggestedQty({ id: 'x', stock: 50, minStock: 0 })).toBe(1);
  });

  it('builds a count sheet and the differences', () => {
    const sheet = countSheet(products);
    expect(sheet.map((line) => line.productId)).toEqual(['c', 'a', 'e', 'b']);
    const counted = applyCounts(sheet, [
      { productId: 'a', counted: 1 },
      { productId: 'b', counted: 42 },
      { productId: 'zzz', counted: 5 },
    ]);
    expect(counted.find((line) => line.productId === 'a')?.difference).toBe(-1);
    expect(countSummary(counted)).toEqual({ totalLines: 4, countedLines: 2, shortageUnits: -1, surplusUnits: 2, mismatchedLines: 2 });
    expect(countSheet(products, ['d']).map((line) => line.productId)).toEqual(['d']);
  });

  it('totals an order', () => {
    expect(orderTotal([{ quantity: 3, unitCost: 10.555 }, { quantity: 1, unitCost: 2 }])).toBe(33.67);
  });
});

describe('GymStockService', () => {
  const docs: Record<string, Record<string, unknown>> = {};
  const writes: { op: string; id: string; data: Record<string, unknown> }[] = [];
  const collection = (name: string) => ({
    doc: (id?: string) => ({ id: id ?? `${name}-new`, path: `${name}/${id}` }),
    firestore: {
      runTransaction: async (fn: (tx: unknown) => Promise<void>) =>
        fn({
          getAll: async (...refs: { id: string }[]) =>
            refs.map((ref) => ({ exists: !!docs[ref.id], data: () => docs[ref.id] })),
          update: (ref: { id: string }, data: Record<string, unknown>) => writes.push({ op: 'update', id: ref.id, data }),
          set: (ref: { id: string }, data: Record<string, unknown>) => writes.push({ op: 'set', id: ref.id, data }),
        }),
    },
  });
  const store = {
    userId: () => 'staff',
    tenantId: () => 't1',
    collection: jest.fn(collection),
    list: jest.fn(),
    getOrThrow: jest.fn(),
    update: jest.fn(async (_n: string, id: string, _c: string, _m: string, patch: object) => ({ id, ...patch })),
    create: jest.fn(async (_n: string, fields: object) => ({ id: 'new', createdAt: 'now', ...fields })),
  };
  let service: GymStockService;

  beforeEach(() => {
    jest.clearAllMocks();
    writes.length = 0;
    docs['p1'] = { id: 'p1', name: 'Protein', stock: 4 };
    docs['p2'] = { id: 'p2', name: 'Su', stock: 10 };
    service = new GymStockService(store as never);
  });

  it('completes a count by setting the counted stock and logging the difference', async () => {
    store.getOrThrow.mockResolvedValue({
      id: 'c1',
      status: 'open',
      lines: [
        { productId: 'p1', productName: 'Protein', sku: '', expected: 4, counted: 6, difference: 2 },
        { productId: 'p2', productName: 'Su', sku: '', expected: 10, counted: null, difference: null },
      ],
    });
    await service.completeCount('c1');
    expect(writes).toEqual([
      { op: 'update', id: 'p1', data: expect.objectContaining({ stock: 6 }) },
      { op: 'set', id: 'gymStockMovements-new', data: expect.objectContaining({ productId: 'p1', type: 'count', delta: 2, before: 4, after: 6 }) },
    ]);
    expect(store.update).toHaveBeenCalledWith(expect.anything(), 'c1', expect.anything(), expect.anything(), expect.objectContaining({ status: 'completed' }));
  });

  it('refuses to complete a finished count', async () => {
    store.getOrThrow.mockResolvedValue({ id: 'c1', status: 'completed', lines: [] });
    await expect(service.completeCount('c1')).rejects.toMatchObject({ code: ErrorCode.GYM_STOCK_STATE });
  });

  it('receives an order: stock up, cost updated, supplier balance grows by the received value', async () => {
    store.getOrThrow.mockImplementation(async (name: string) =>
      name === 'gymPurchaseOrders'
        ? {
            id: 'o1',
            status: 'ordered',
            supplierId: 's1',
            supplierName: 'Toptancı',
            lines: [
              { productId: 'p1', productName: 'Protein', quantity: 10, unitCost: 250, total: 2500 },
              { productId: 'p2', productName: 'Su', quantity: 24, unitCost: 5, total: 120 },
            ],
          }
        : { id: 's1', balance: 100 },
    );
    await service.receiveOrder('o1', { lines: [{ productId: 'p1', receivedQuantity: 8 }] });
    expect(writes[0]).toEqual({ op: 'update', id: 'p1', data: expect.objectContaining({ stock: 12, cost: 250 }) });
    expect(writes.filter((write) => write.op === 'update')).toHaveLength(1);
    expect(store.update).toHaveBeenCalledWith('gymSuppliers', 's1', expect.anything(), expect.anything(), { balance: 2100 });
    expect(store.update).toHaveBeenLastCalledWith(
      'gymPurchaseOrders',
      'o1',
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ status: 'received', receivedAmount: 2000 }),
    );
  });

  it('does not receive a cancelled order twice', async () => {
    store.getOrThrow.mockResolvedValue({ id: 'o1', status: 'received', lines: [] });
    await expect(service.receiveOrder('o1', {})).rejects.toMatchObject({ code: ErrorCode.GYM_STOCK_STATE });
  });

  it('creates an order with names and totals from the products', async () => {
    store.getOrThrow.mockResolvedValue({ id: 's1', name: 'Toptancı' });
    store.list.mockResolvedValue([docs['p1'], docs['p2']]);
    const order = await service.createOrder({ supplierId: 's1', lines: [{ productId: 'p1', quantity: 2, unitCost: 99.5 }] });
    expect(order).toMatchObject({ status: 'draft', supplierName: 'Toptancı', totalAmount: 199 });
    await expect(
      service.createOrder({ supplierId: 's1', lines: [{ productId: 'nope', quantity: 1, unitCost: 1 }] }),
    ).rejects.toMatchObject({ code: ErrorCode.GYM_PRODUCT_NOT_FOUND });
  });
});
