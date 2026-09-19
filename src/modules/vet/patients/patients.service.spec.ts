import { PatientsService } from './patients.service';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { AppException } from '../../../shared/errors/app.exception';

describe('PatientsService', () => {
  const patients = {
    create: jest.fn(),
    getByIdOrThrow: jest.fn(),
    list: jest.fn(),
    collect: jest.fn(),
    update: jest.fn(),
    softDelete: jest.fn(),
  };
  const customers = {
    findById: jest.fn(),
    findByIds: jest.fn(),
  };
  let service: PatientsService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new PatientsService(patients as never, customers as never);
  });

  it('creates a patient when customer exists in the current tenant', async () => {
    customers.findById.mockResolvedValue({ id: 'c1' });
    patients.create.mockResolvedValue({ id: 'p1', customerId: 'c1' });
    await expect(
      service.create({ customerId: 'c1', name: 'Max', animalType: 'dog' }),
    ).resolves.toMatchObject({ id: 'p1' });
  });

  it('rejects a missing customer', async () => {
    customers.findById.mockResolvedValue(null);
    await expect(
      service.create({ customerId: 'missing', name: 'Max', animalType: 'dog' }),
    ).rejects.toMatchObject({ code: ErrorCode.PATIENT_INVALID });
  });

  it('rejects a customer that is not visible in this tenant (cross-tenant)', async () => {
    customers.findById.mockResolvedValue(null);
    await expect(
      service.create({ customerId: 'other-tenant-customer', name: 'Max', animalType: 'dog' }),
    ).rejects.toBeInstanceOf(AppException);
    expect(patients.create).not.toHaveBeenCalled();
  });

  it('applies column filters after customer enrichment', async () => {
    patients.collect.mockResolvedValue([
      {
        id: 'p1',
        customerId: 'c1',
        name: 'Pamuk',
        createdAt: '2026-01-02T00:00:00.000Z',
      },
      {
        id: 'p2',
        customerId: 'c2',
        name: 'Karabaş',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ]);
    customers.findByIds.mockResolvedValue(
      new Map([
        ['c1', { firstName: 'Ahmet', lastName: 'Arabali', phone: '555', email: 'a@a.com' }],
        ['c2', { firstName: 'Mehmet', lastName: 'Yılmaz', phone: '444', email: null }],
      ]),
    );
    const page = await service.list({ filters: { customerName: 'ahmet' }, limit: 20 });
    expect(patients.list).not.toHaveBeenCalled();
    expect(page.items).toHaveLength(1);
    expect(page.items[0].id).toBe('p1');
    expect(page.items[0].customerName).toBe('Ahmet Arabali');
  });
});
