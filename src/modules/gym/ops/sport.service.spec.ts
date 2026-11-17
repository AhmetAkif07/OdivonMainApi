import { GymSportService } from './sport.service';
import { ErrorCode } from '../../../shared/errors/error-codes';

describe('GymSportService', () => {
  const store = {
    userId: jest.fn().mockReturnValue('u1'),
    tenantId: jest.fn().mockReturnValue('t1'),
    getOrThrow: jest.fn(),
    listBy: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    list: jest.fn(),
    page: jest.fn(),
    update: jest.fn(),
    softDelete: jest.fn(),
  };

  const tenant = { getStore: jest.fn() };
  const push = { notifyMember: jest.fn(), notifyStaff: jest.fn() };
  let service: GymSportService;

  beforeEach(() => {
    jest.resetAllMocks();
    store.userId.mockReturnValue('u1');
    store.tenantId.mockReturnValue('t1');
    store.listBy.mockResolvedValue([]);
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
    service = new GymSportService(store as never, tenant as never, push as never);
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
    store.listBy.mockResolvedValue([
      { id: 'req1', userId: 'm1', status: 'pending', createdAt: '2026-10-01T00:00:00.000Z' },
      { id: 'req3', userId: 'm1', type: 'measurement', status: 'pending', createdAt: '2026-10-01T00:00:00.000Z' },
    ]);
    await service.createWorkout({ userId: 'm1', title: 'Push' });
    expect(store.listBy).toHaveBeenCalledWith('gymProgramRequests', 'userId', 'm1');
    const fulfilled = store.update.mock.calls.find((call) => call[1] === 'req1');
    expect(fulfilled?.[4]).toMatchObject({ status: 'fulfilled', planId: 'plan1' });
    expect(store.update.mock.calls.some((call) => call[1] === 'req3')).toBe(false);
    expect(push.notifyMember).toHaveBeenCalledWith('t1', 'm1', expect.objectContaining({ type: 'new_program' }));
  });

  it('turns a period into an end date and a zero target counter', async () => {
    await service.createWorkout({ userId: 'm1', title: 'Push', durationWeeks: 8, targetDaysPerWeek: 3, startDate: '2026-11-02T00:00:00.000Z' });
    const fields = store.create.mock.calls.find((call) => call[0] === 'gymWorkoutPlans')?.[1];
    expect(fields).toMatchObject({
      durationWeeks: 8,
      targetDaysPerWeek: 3,
      endDate: '2026-12-28T00:00:00.000Z',
      progressStats: { completedSessions: 0 },
    });
  });

  it('notifies the member about a plan change once, and never about a status change alone', async () => {
    store.getOrThrow.mockResolvedValue({ id: 'p1', userId: 'm1', title: 'Push', createdAt: '2026-10-01T00:00:00.000Z' });
    await service.updateWorkout('p1', { status: 'completed' });
    expect(push.notifyMember).not.toHaveBeenCalled();
    await service.updateWorkout('p1', { title: 'Push 2' });
    expect(push.notifyMember).toHaveBeenCalledTimes(1);
    store.getOrThrow.mockResolvedValue({ id: 'p1', userId: 'm1', updateNotifiedAt: new Date().toISOString() });
    await service.updateWorkout('p1', { title: 'Push 3' });
    expect(push.notifyMember).toHaveBeenCalledTimes(1);
  });

  it('closes the member measurement request when a trainer enters a measurement', async () => {
    store.listBy.mockResolvedValue([
      { id: 'req9', userId: 'm1', type: 'measurement', status: 'accepted', createdAt: '2026-10-01T00:00:00.000Z' },
    ]);
    await service.createMeasurement({ userId: 'm1', weight: 80 } as never);
    expect(store.update.mock.calls.find((call) => call[1] === 'req9')?.[4]).toMatchObject({ status: 'fulfilled' });
  });

  it('lets a trainer accept a floor call, then close it, with a reply to the member', async () => {
    store.getOrThrow.mockResolvedValue({ id: 'h1', userId: 'm1', type: 'floor_help', status: 'pending', createdAt: new Date().toISOString() });
    await expect(service.resolveProgramRequest('h1', { status: 'accepted' })).resolves.toMatchObject({ status: 'accepted' });
    expect(push.notifyMember).toHaveBeenCalledWith('t1', 'm1', expect.objectContaining({ type: 'request_accepted', urgent: true }));
    store.getOrThrow.mockResolvedValue({ id: 'h1', userId: 'm1', type: 'floor_help', status: 'accepted', acceptedAt: new Date().toISOString() });
    await expect(service.resolveProgramRequest('h1', { status: 'fulfilled', reply: 'Formun iyi' })).resolves.toMatchObject({
      status: 'fulfilled',
      reply: 'Formun iyi',
    });
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

  it('shows a trainer floor calls and unassigned requests of every kind with type=all', async () => {
    tenant.getStore.mockReturnValue({
      role: 'user',
      email: 'coach@gym.test',
      userId: 'uid-coach',
      permissions: { workouts: ['view', 'create', 'update', 'delete'], members: ['view'] },
    });
    store.list.mockImplementation(async (name: string) => {
      if (name === 'gymStaff') return [{ id: 'staff-1', email: 'coach@gym.test' }];
      return [
        { id: 'help', type: 'floor_help', trainerId: 'staff-2', status: 'pending', createdAt: '2026-10-04T00:00:00.000Z', userId: 'm2' },
        { id: 'pool', type: 'measurement', trainerId: null, status: 'pending', createdAt: '2026-10-03T00:00:00.000Z', userId: 'm3' },
        { id: 'other', type: 'program_change', trainerId: 'staff-2', status: 'pending', createdAt: '2026-10-02T00:00:00.000Z', userId: 'm2' },
        { id: 'uid', trainerId: 'uid-coach', status: 'pending', createdAt: '2026-10-01T00:00:00.000Z', userId: 'm1' },
      ];
    });
    const all = await service.listProgramRequests({ type: 'all' });
    expect(all.map((item) => item.id)).toEqual(['help', 'pool', 'uid']);
    const programs = await service.listProgramRequests();
    expect(programs.map((item) => item.id)).toEqual(['uid']);
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
