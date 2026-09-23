import { ErrorCode } from '../../../../shared/errors/error-codes';
import { ProductsService } from './products.service';

function createRepository() {
  return {
    create: jest.fn(),
    getByIdOrThrow: jest.fn(),
    findById: jest.fn(),
    findByIds: jest.fn().mockResolvedValue(new Map()),
    collect: jest.fn(),
    update: jest.fn(),
    softDelete: jest.fn(),
    isReferenced: jest.fn(),
  };
}

describe('ProductsService', () => {
  const products = createRepository();
  const categories = createRepository();
  const units = createRepository();
  const taxes = createRepository();
  const suppliers = createRepository();
  const stores = createRepository();
  let service: ProductsService;

  beforeEach(() => {
    jest.resetAllMocks();
    for (const repository of [products, categories, units, taxes, suppliers, stores]) {
      repository.findByIds.mockResolvedValue(new Map());
    }
    service = new ProductsService(
      products as never,
      categories as never,
      units as never,
      taxes as never,
      suppliers as never,
      stores as never,
    );
  });

  it('creates a product when every referenced definition exists', async () => {
    categories.findById.mockResolvedValue({ id: 'c1' });
    taxes.findById.mockResolvedValue({ id: 't1' });
    products.create.mockResolvedValue({ id: 'p1' });
    await expect(
      service.create({ productType: 'product', name: 'Mama', categoryId: 'c1', taxId: 't1' }),
    ).resolves.toMatchObject({ id: 'p1' });
  });

  it('rejects a missing category', async () => {
    categories.findById.mockResolvedValue(null);
    await expect(
      service.create({ productType: 'product', name: 'Mama', categoryId: 'missing' }),
    ).rejects.toMatchObject({ code: ErrorCode.DEFINITION_INVALID });
    expect(products.create).not.toHaveBeenCalled();
  });

  it('filters by product type and enriches names', async () => {
    products.collect.mockResolvedValue([
      {
        id: 'p1',
        name: 'Mama',
        productType: 'product',
        categoryId: 'c1',
        taxId: 't1',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 's1',
        name: 'Muayene',
        productType: 'service',
        categoryId: null,
        taxId: null,
        createdAt: '2026-01-02T00:00:00.000Z',
      },
    ]);
    categories.findByIds.mockResolvedValue(new Map([['c1', { id: 'c1', name: 'Gıda' }]]));
    taxes.findByIds.mockResolvedValue(new Map([['t1', { id: 't1', name: 'KDV', ratio: 20 }]]));
    const page = await service.list({ productType: 'product', limit: 20 });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({ id: 'p1', categoryName: 'Gıda', taxRatio: 20 });
  });

  it('supports column filters on enriched fields', async () => {
    products.collect.mockResolvedValue([
      { id: 'p1', name: 'Mama', productType: 'product', categoryId: 'c1', createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 'p2', name: 'Tasma', productType: 'product', categoryId: 'c2', createdAt: '2026-01-02T00:00:00.000Z' },
    ]);
    categories.findByIds.mockResolvedValue(
      new Map([
        ['c1', { id: 'c1', name: 'Gıda' }],
        ['c2', { id: 'c2', name: 'Aksesuar' }],
      ]),
    );
    const page = await service.list({ filters: { categoryName: 'aksesuar' }, limit: 20 });
    expect(page.items.map((item) => item.id)).toEqual(['p2']);
  });
});
