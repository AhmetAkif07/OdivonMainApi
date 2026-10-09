import { GymSportService } from './sport.service';
import { ErrorCode } from '../../../shared/errors/error-codes';

describe('GymSportService', () => {
  const store = {
    userId: jest.fn().mockReturnValue('u1'),
    getOrThrow: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    list: jest.fn(),
    page: jest.fn(),
    update: jest.fn(),
    softDelete: jest.fn(),
  };

  const tenant = { getStore: jest.fn() };
  let service: GymSportService;

  beforeEach(() => {
    jest.resetAllMocks();
    store.userId.mockReturnValue('u1');
    tenant.getStore.mockReturnValue({
      role: 'owner',
      email: 'owner@gym.test',
      userId: 'u1',
      permissions: {},
    });
    store.create.mockImplementation(async (_name: string, fields: object) => ({ id: 'plan1', createdAt: '2026-10-07T00:00:00.000Z', ...fields }));
    store.list.mockResolvedValue([]);
    store.update.mockImplementation(async (_name: string, id: string, _code: string, _msg: string, patch: object) => ({
      id,
      createdAt: '2026-10-01T00:00:00.000Z',
      ...patch,
    }));
    service = new GymSportService(store as never, tenant as never);
  });

  it('rejects overlapping trainer appointments', async () => {
    store.list.mockResolvedValue([
      {
        trainerId: 't1',
        status: 'booked',
        appointmentTime: '2026-09-25T10:00:00.000Z',
        duration: 60,
      },
    ]);

    await expect(
      service.createAppointment({
        trainerId: 't1',
        appointmentTime: '2026-09-25T10:30:00.000Z',
        duration: 60,
      }),
    ).rejects.toMatchObject({ code: ErrorCode.GYM_PT_CONFLICT });
  });

  it('marks the member pending program request fulfilled when a plan is assigned', async () => {
    store.list.mockResolvedValue([
      { id: 'req1', userId: 'm1', status: 'pending', createdAt: '2026-10-01T00:00:00.000Z' },
      { id: 'req2', userId: 'm2', status: 'pending', createdAt: '2026-10-01T00:00:00.000Z' },
    ]);
    await service.createWorkout({ userId: 'm1', title: 'Push' });
    const fulfilled = store.update.mock.calls.find((call) => call[1] === 'req1');
    expect(fulfilled?.[4]).toMatchObject({ status: 'fulfilled', planId: 'plan1' });
    expect(store.update.mock.calls.some((call) => call[1] === 'req2')).toBe(false);
  });

  it('shows a trainer only requests for their own members', async () => {
    tenant.getStore.mockReturnValue({
      role: 'user',
      email: 'coach@gym.test',
      userId: 'uid-coach',
      permissions: { workouts: ['view', 'create', 'update', 'delete'], members: ['view'] },
    });
    store.list.mockImplementation(async (name: string) => {
      if (name === 'gymStaff') return [{ id: 'staff-1', email: 'coach@gym.test' }];
      return [
        { id: 'mine', trainerId: 'staff-1', status: 'pending', createdAt: '2026-10-02T00:00:00.000Z', userId: 'm1', goal: 'Kuvvet', daysPerWeek: 4 },
        { id: 'other', trainerId: 'staff-2', status: 'pending', createdAt: '2026-10-03T00:00:00.000Z', userId: 'm2', goal: 'Kilo', daysPerWeek: 3 },
      ];
    });
    const items = await service.listProgramRequests();
    expect(items.map((item) => item.id)).toEqual(['mine']);
  });

  it('rejects a second resolution and a fulfillment without a plan', async () => {
    store.getOrThrow.mockResolvedValue({ id: 'req1', userId: 'm1', status: 'fulfilled', trainerId: 'staff-1' });
    await expect(service.resolveProgramRequest('req1', { status: 'rejected' })).rejects.toMatchObject({
      code: ErrorCode.VALIDATION_ERROR,
    });
    store.getOrThrow.mockResolvedValue({ id: 'req1', userId: 'm1', status: 'pending', trainerId: 'staff-1' });
    await expect(service.resolveProgramRequest('req1', { status: 'fulfilled' })).rejects.toMatchObject({
      code: ErrorCode.VALIDATION_ERROR,
    });
  });
});
