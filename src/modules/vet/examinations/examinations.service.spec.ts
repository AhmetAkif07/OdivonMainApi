import { ExaminationsService } from './examinations.service';
import { ErrorCode } from '../../../shared/errors/error-codes';

describe('ExaminationsService', () => {
  const examinations = {
    create: jest.fn(),
    getByIdOrThrow: jest.fn(),
    list: jest.fn(),
    update: jest.fn(),
    softDelete: jest.fn(),
  };
  const customers = { findById: jest.fn() };
  const patients = { findById: jest.fn() };
  let service: ExaminationsService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new ExaminationsService(
      examinations as never,
      customers as never,
      patients as never,
    );
  });

  it('creates an examination when patient belongs to customer', async () => {
    customers.findById.mockResolvedValue({ id: 'c1' });
    patients.findById.mockResolvedValue({ id: 'p1', customerId: 'c1' });
    examinations.create.mockResolvedValue({ id: 'e1' });
    await expect(
      service.create({
        date: '2026-01-01T10:00:00.000Z',
        customerId: 'c1',
        patientId: 'p1',
      }),
    ).resolves.toMatchObject({ id: 'e1' });
  });

  it('rejects invalid patient', async () => {
    customers.findById.mockResolvedValue({ id: 'c1' });
    patients.findById.mockResolvedValue(null);
    await expect(
      service.create({
        date: '2026-01-01T10:00:00.000Z',
        customerId: 'c1',
        patientId: 'missing',
      }),
    ).rejects.toMatchObject({ code: ErrorCode.PATIENT_INVALID });
  });
});
