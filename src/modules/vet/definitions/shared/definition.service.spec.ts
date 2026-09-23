import { ErrorCode } from '../../../../shared/errors/error-codes';
import { TENANT_COLLECTION } from '../../../../shared/firebase/firestore-path';
import { AppointmentTypesService } from '../appointment-types/appointment-types.service';
import { CashRegistersService } from '../cash-registers/cash-registers.service';
import { CustomerGroupsService } from '../customer-groups/customer-groups.service';
import { PaymentMethodsService } from '../payment-methods/payment-methods.service';
import { ProductCategoriesService } from '../product-categories/product-categories.service';
import { StoresService } from '../stores/stores.service';
import { SuppliersService } from '../suppliers/suppliers.service';
import { TaxesService } from '../taxes/taxes.service';
import { UnitsService } from '../units/units.service';

function createRepository() {
  return {
    create: jest.fn(),
    getByIdOrThrow: jest.fn(),
    findById: jest.fn(),
    findByIds: jest.fn(),
    collect: jest.fn(),
    update: jest.fn(),
    softDelete: jest.fn(),
    isReferenced: jest.fn(),
  };
}

type Repository = ReturnType<typeof createRepository>;

const simpleServices: Array<[string, (repository: Repository) => { softDelete(id: string): Promise<void> }, string[]]> = [
  ['ProductCategoriesService', (repository) => new ProductCategoriesService(repository as never), ['categoryId']],
  ['UnitsService', (repository) => new UnitsService(repository as never), ['unitId']],
  ['TaxesService', (repository) => new TaxesService(repository as never), ['taxId', 'taxId']],
  ['StoresService', (repository) => new StoresService(repository as never), ['storeId']],
  ['SuppliersService', (repository) => new SuppliersService(repository as never), ['supplierId']],
  ['PaymentMethodsService', (repository) => new PaymentMethodsService(repository as never), []],
  ['CustomerGroupsService', (repository) => new CustomerGroupsService(repository as never), []],
  ['CashRegistersService', (repository) => new CashRegistersService(repository as never), []],
  [
    'AppointmentTypesService',
    (repository) => new AppointmentTypesService(repository as never, createRepository() as never),
    [],
  ],
];

describe.each(simpleServices)('%s', (_name, build, referenceFields) => {
  let repository: Repository;
  let service: ReturnType<typeof build>;

  beforeEach(() => {
    repository = createRepository();
    service = build(repository);
    repository.getByIdOrThrow.mockResolvedValue({ id: 'd1', name: 'Tanım' });
  });

  it('soft-deletes an unused definition', async () => {
    repository.isReferenced.mockResolvedValue(false);
    await service.softDelete('d1');
    expect(repository.softDelete).toHaveBeenCalledWith('d1');
    expect(repository.isReferenced).toHaveBeenCalledTimes(referenceFields.length);
    referenceFields.forEach((field, index) => {
      expect(repository.isReferenced.mock.calls[index][1]).toBe(field);
      expect(repository.isReferenced.mock.calls[index][2]).toBe('d1');
    });
  });

  if (referenceFields.length > 0) {
    it('blocks deleting a definition that is in use', async () => {
      repository.isReferenced.mockResolvedValue(true);
      await expect(service.softDelete('d1')).rejects.toMatchObject({
        code: ErrorCode.DEFINITION_IN_USE,
      });
      expect(repository.softDelete).not.toHaveBeenCalled();
    });
  }
});

describe('DefinitionService list', () => {
  it('applies column filters and paginates in memory', async () => {
    const repository = createRepository();
    repository.collect.mockResolvedValue([
      { id: 'u1', name: 'Adet', code: 'ADT', createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 'u2', name: 'Kutu', code: 'KT', createdAt: '2026-01-02T00:00:00.000Z' },
    ]);
    const service = new UnitsService(repository as never);
    const page = await service.list({ filters: { name: 'kut' }, limit: 20 });
    expect(page.items.map((item) => item.id)).toEqual(['u2']);
  });
});

describe('TaxesService references', () => {
  it('checks products and appointment types', async () => {
    const repository = createRepository();
    repository.getByIdOrThrow.mockResolvedValue({ id: 't1' });
    repository.isReferenced.mockResolvedValue(false);
    await new TaxesService(repository as never).softDelete('t1');
    expect(repository.isReferenced.mock.calls.map((call) => call[0])).toEqual([
      TENANT_COLLECTION.products,
      TENANT_COLLECTION.appointmentTypes,
    ]);
  });
});

describe('AppointmentTypesService', () => {
  it('rejects an unknown tax', async () => {
    const repository = createRepository();
    const taxes = createRepository();
    taxes.findById.mockResolvedValue(null);
    const service = new AppointmentTypesService(repository as never, taxes as never);
    await expect(service.create({ name: 'Muayene', taxId: 'missing' })).rejects.toMatchObject({
      code: ErrorCode.DEFINITION_INVALID,
    });
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('adds tax names to list items', async () => {
    const repository = createRepository();
    const taxes = createRepository();
    repository.collect.mockResolvedValue([
      { id: 'a1', name: 'Muayene', taxId: 't1', createdAt: '2026-01-01T00:00:00.000Z' },
    ]);
    taxes.findByIds.mockResolvedValue(new Map([['t1', { id: 't1', name: 'KDV %20' }]]));
    const service = new AppointmentTypesService(repository as never, taxes as never);
    const page = await service.list({ limit: 20 });
    expect(page.items[0].taxName).toBe('KDV %20');
  });
});
