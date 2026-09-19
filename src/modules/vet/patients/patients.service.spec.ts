import { PatientsService } from './patients.service';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { AppException } from '../../../shared/errors/app.exception';

describe('PatientsService', () => {
  const patients = {
    create: jest.fn(),
    getByIdOrThrow: jest.fn(),
    list: jest.fn(),
    update: jest.fn(),
    softDelete: jest.fn(),
  };
  const customers = {
    findById: jest.fn(),
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
});
