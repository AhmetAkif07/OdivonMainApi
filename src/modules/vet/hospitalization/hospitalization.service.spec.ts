import { HospitalizationService } from './hospitalization.service';

describe('HospitalizationService', () => {
  const repo = {
    listCages: jest.fn(),
    createCage: jest.fn(),
    updateCage: jest.fn(),
    getCageByIdOrThrow: jest.fn(),
    create: jest.fn(),
    getByIdOrThrow: jest.fn(),
    list: jest.fn(),
    update: jest.fn(),
    addVitalLog: jest.fn(),
    discharge: jest.fn(),
    softDelete: jest.fn(),
  };
  const customers = { findById: jest.fn(), findByIds: jest.fn().mockResolvedValue(new Map()) };
  const patients = { findById: jest.fn(), findByIds: jest.fn().mockResolvedValue(new Map()) };
  let service: HospitalizationService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new HospitalizationService(
      repo as never,
      customers as never,
      patients as never,
    );
  });

  it('admits a patient and occupies cage', async () => {
    customers.findById.mockResolvedValue({ id: 'c1' });
    patients.findById.mockResolvedValue({ id: 'p1', name: 'Pamuk' });
    repo.getCageByIdOrThrow.mockResolvedValue({ id: 'cage-1', name: 'Kedi Box 1', status: 'available' });
    repo.create.mockResolvedValue({ id: 'h1', patientId: 'p1', cageId: 'cage-1' });

    const result = await service.create({
      customerId: 'c1',
      patientId: 'p1',
      cageId: 'cage-1',
      admittedAt: '2026-02-01T10:00:00.000Z',
      reason: 'Ameliyat sonrası takip',
    });

    expect(result).toMatchObject({ id: 'h1' });
    expect(repo.updateCage).toHaveBeenCalledWith('cage-1', expect.objectContaining({
      status: 'occupied',
      currentHospitalizationId: 'h1',
      currentPatientName: 'Pamuk',
    }));
  });

  it('discharges patient and marks cage for cleaning', async () => {
    repo.discharge.mockResolvedValue({ id: 'h1', cageId: 'cage-1', status: 'discharged' });

    const result = await service.discharge('h1');
    expect(result.status).toBe('discharged');
    expect(repo.updateCage).toHaveBeenCalledWith('cage-1', expect.objectContaining({
      status: 'cleaning',
      currentHospitalizationId: null,
      currentPatientName: null,
    }));
  });
});
