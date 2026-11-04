import { ErrorCode } from '../../../shared/errors/error-codes';
import { Surgery } from './surgery.entity';
import { SurgeriesService, durationMinutes } from './surgeries.service';

describe('surgery duration', () => {
  it('counts minutes and handles surgeries past midnight', () => {
    expect(durationMinutes({ anesthesiaStart: null, surgeryStart: '09:15', surgeryEnd: '10:40', recoveryEnd: null })).toBe(85);
    expect(durationMinutes({ anesthesiaStart: null, surgeryStart: '23:30', surgeryEnd: '00:45', recoveryEnd: null })).toBe(75);
    expect(durationMinutes({ anesthesiaStart: null, surgeryStart: '09:00', surgeryEnd: null, recoveryEnd: null })).toBeNull();
  });
});

describe('SurgeriesService', () => {
  const repo = {
    create: jest.fn(),
    save: jest.fn(),
    getByIdOrThrow: jest.fn(),
    collect: jest.fn(),
    since: jest.fn(),
    whereEquals: jest.fn(),
    softDelete: jest.fn(),
    patientWithOwner: jest.fn(),
  };
  const identity = { listByCurrentTenant: jest.fn() };
  let service: SurgeriesService;

  beforeEach(() => {
    jest.resetAllMocks();
    repo.create.mockImplementation(async (fields) => ({ id: 's1', ...fields }));
    repo.save.mockImplementation(async (item) => item);
    repo.patientWithOwner.mockResolvedValue({ patientName: 'Pamuk', customerId: 'c1', customerName: 'Ayşe Kaya' });
    identity.listByCurrentTenant.mockResolvedValue([
      { uid: 'dr', displayName: 'Dr. Ece', email: 'e@x' },
      { uid: 'as', displayName: '', email: 'asistan@x' },
    ]);
    service = new SurgeriesService(repo as never, identity as never);
  });

  it('fills names, the default checklist and the duration', async () => {
    const created = await service.create({
      date: '2026-11-04',
      patientId: 'p1',
      type: ' Kısırlaştırma ',
      surgeonId: 'dr',
      assistantIds: ['as', 'as'],
      anesthesia: { asaClass: 2 },
      times: { surgeryStart: '10:00', surgeryEnd: '10:50' },
    });
    expect(created).toMatchObject({
      type: 'Kısırlaştırma',
      patientName: 'Pamuk',
      customerId: 'c1',
      surgeonName: 'Dr. Ece',
      assistantIds: ['as'],
      assistantNames: ['asistan@x'],
      durationMinutes: 50,
      status: 'planned',
      anesthesia: { asaClass: 2, emergency: false },
    });
    expect(created.checklist.length).toBeGreaterThan(5);
    expect(created.checklist.every((item) => !item.done)).toBe(true);
  });

  it('refuses an unknown patient and a completed surgery without times', async () => {
    repo.patientWithOwner.mockResolvedValueOnce(null);
    await expect(service.create({ date: '2026-11-04', patientId: 'x', type: 'A' })).rejects.toMatchObject({
      code: ErrorCode.VALIDATION_ERROR,
    });
    await expect(service.create({ date: '2026-11-04', patientId: 'p1', type: 'A', status: 'completed' })).rejects.toMatchObject({
      code: ErrorCode.VALIDATION_ERROR,
    });
  });

  it('merges time and anesthesia changes and recomputes the duration', async () => {
    repo.getByIdOrThrow.mockResolvedValue({
      id: 's1',
      times: { anesthesiaStart: '09:30', surgeryStart: '10:00', surgeryEnd: null, recoveryEnd: null },
      anesthesia: { asaClass: 1, emergency: false, protocol: 'P', agents: null, monitoring: null },
      status: 'inProgress',
    } as unknown as Surgery);
    const updated = await service.update('s1', {
      times: { surgeryEnd: '11:15' },
      anesthesia: { emergency: true },
      status: 'completed',
    });
    expect(updated.times).toMatchObject({ anesthesiaStart: '09:30', surgeryStart: '10:00', surgeryEnd: '11:15' });
    expect(updated.anesthesia).toMatchObject({ asaClass: 1, emergency: true, protocol: 'P' });
    expect(updated.durationMinutes).toBe(75);
  });

  it('lists a patient with filters, newest first', async () => {
    repo.whereEquals.mockResolvedValue([
      { id: 'a', date: '2026-10-01', status: 'completed', times: {} },
      { id: 'b', date: '2026-11-01', status: 'completed', times: {} },
      { id: 'c', date: '2026-11-02', status: 'cancelled', times: {} },
    ]);
    const list = await service.list({ patientId: 'p1', status: 'completed' });
    expect(list.map((item) => item.id)).toEqual(['b', 'a']);
  });
});
