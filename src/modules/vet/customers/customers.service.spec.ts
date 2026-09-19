import { tenantCollectionPath } from '../../../shared/firebase/firestore-path';
import { CustomersService } from './customers.service';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { AppException } from '../../../shared/errors/app.exception';
import { Customer } from './entities/customer.entity';

function customer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: 'c1',
    firstName: 'Ahmet',
    lastName: 'Arabali',
    phone: '555',
    email: null,
    address: null,
    note: null,
    discountRate: 0,
    isArchive: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'u1',
    updatedBy: 'u1',
    deletedAt: null,
    ...overrides,
  };
}

describe('CustomersService', () => {
  const repo = {
    create: jest.fn(),
    getByIdOrThrow: jest.fn(),
    list: jest.fn(),
    collect: jest.fn(),
    update: jest.fn(),
    softDelete: jest.fn(),
  };
  const patients = { toPatient: jest.fn(), findByCustomerIds: jest.fn() };
  const firebase = { db: { collection: jest.fn(), batch: jest.fn() } };
  const tenantContext = { getTenantId: jest.fn().mockReturnValue('tenant-a'), getUserId: jest.fn().mockReturnValue('u1') };
  const audit = { record: jest.fn() };
  let service: CustomersService;

  beforeEach(() => {
    jest.resetAllMocks();
    tenantContext.getTenantId.mockReturnValue('tenant-a');
    tenantContext.getUserId.mockReturnValue('u1');
    service = new CustomersService(
      repo as never,
      patients as never,
      firebase as never,
      tenantContext as never,
      audit as never,
    );
  });

  it('creates a customer', async () => {
    repo.create.mockResolvedValue(customer());
    const result = await service.create({
      firstName: 'Ahmet',
      lastName: 'Arabali',
      phone: '555',
    });
    expect(result.customer.id).toBe('c1');
    expect(result.patient).toBeUndefined();
  });

  it('gets a customer', async () => {
    repo.getByIdOrThrow.mockResolvedValue(customer());
    await expect(service.getById('c1')).resolves.toMatchObject({ id: 'c1' });
  });

  it('updates a customer', async () => {
    repo.update.mockResolvedValue(customer({ isArchive: true }));
    await expect(service.update('c1', { isArchive: true })).resolves.toMatchObject({
      isArchive: true,
    });
  });

  it('soft deletes a customer', async () => {
    repo.softDelete.mockResolvedValue(undefined);
    await service.softDelete('c1');
    expect(repo.softDelete).toHaveBeenCalledWith('c1');
  });

  it('applies column filters after patient enrichment', async () => {
    repo.collect.mockResolvedValue([
      customer(),
      customer({ id: 'c2', firstName: 'Mehmet', lastName: 'Yılmaz' }),
    ]);
    patients.findByCustomerIds.mockResolvedValue(
      new Map([
        ['c1', [{ id: 'p1', name: 'Pamuk', animalType: 'kedi' }]],
        ['c2', [{ id: 'p2', name: 'Karabaş', animalType: 'köpek' }]],
      ]),
    );
    const page = await service.list({ filters: { patients: 'pamuk' }, limit: 20 });
    expect(repo.list).not.toHaveBeenCalled();
    expect(page.items).toHaveLength(1);
    expect(page.items[0].id).toBe('c1');
  });

  it('propagates not found', async () => {
    repo.getByIdOrThrow.mockRejectedValue(
      new AppException(ErrorCode.CUSTOMER_NOT_FOUND, 'Customer not found'),
    );
    await expect(service.getById('missing')).rejects.toMatchObject({
      code: ErrorCode.CUSTOMER_NOT_FOUND,
    });
  });
});

describe('tenant isolation path', () => {
  it('never uses a root customers collection', () => {
    expect(tenantCollectionPath('tenant-a', 'customers')).toBe('tenants/tenant-a/customers');
    expect(tenantCollectionPath('tenant-b', 'customers')).toBe('tenants/tenant-b/customers');
    expect(tenantCollectionPath('tenant-a', 'customers')).not.toBe('customers');
  });
});
