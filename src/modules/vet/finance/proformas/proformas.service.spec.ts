import { ErrorCode } from '../../../../shared/errors/error-codes';
import { ProformasService } from './proformas.service';

describe('ProformasService', () => {
  const proformas = { create: jest.fn(), save: jest.fn(), getByIdOrThrow: jest.fn(), collect: jest.fn() };
  const customers = { findById: jest.fn(), findByIds: jest.fn() };
  const products = { findById: jest.fn() };
  const taxes = { findById: jest.fn() };
  const sales = { create: jest.fn() };
  let service: ProformasService;

  beforeEach(() => {
    jest.resetAllMocks();
    customers.findById.mockResolvedValue({ id: 'c1' });
    products.findById.mockResolvedValue({ id: 'p1' });
    taxes.findById.mockResolvedValue({ id: 't20', ratio: 20 });
    proformas.create.mockImplementation(async (fields) => ({ id: 'pf1', ...fields }));
    proformas.save.mockImplementation(async (item) => item);
    service = new ProformasService(
      proformas as never,
      customers as never,
      products as never,
      taxes as never,
      sales as never,
    );
  });

  it('numbers proformas per year and prices them like a sale', async () => {
    proformas.collect.mockResolvedValue([{ number: 'PF-2026-0007' }, { number: 'PF-2025-0042' }]);
    const created = await service.create({
      date: '2026-10-29',
      customerId: 'c1',
      lines: [{ productId: 'p1', quantity: 2, unitPrice: 600, taxId: 't20' }],
    });
    expect(created.number).toBe('PF-2026-0008');
    expect(created).toMatchObject({ total: 1200, vat: 200, net: 1000, status: 'draft' });
  });

  it('converts into a sale once and links it', async () => {
    proformas.getByIdOrThrow.mockResolvedValue({
      id: 'pf1',
      number: 'PF-2026-0001',
      status: 'accepted',
      customerId: 'c1',
      discount: 0,
      remark: null,
      lines: [{ productId: 'p1', quantity: 1, unitPrice: 100, discount: 0, taxId: null, taxRatio: 0, vatIncluded: true }],
    });
    sales.create.mockResolvedValue({ id: 'sale1' });
    const result = await service.convert('pf1', { cashRegisterId: 'r1' });
    expect(sales.create).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'sale', customerId: 'c1', cashRegisterId: 'r1' }),
    );
    expect(result.proforma).toMatchObject({ status: 'converted', saleId: 'sale1' });

    proformas.getByIdOrThrow.mockResolvedValue(result.proforma);
    await expect(service.convert('pf1', {})).rejects.toMatchObject({ code: ErrorCode.INVALID_STATUS });
  });
});
