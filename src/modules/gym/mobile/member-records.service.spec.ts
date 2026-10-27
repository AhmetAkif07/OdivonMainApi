import { ErrorCode } from '../../../shared/errors/error-codes';
import { GymMemberRecordsService } from './member-records.service';

describe('GymMemberRecordsService', () => {
  const store = {
    userId: jest.fn(),
    list: jest.fn(),
    create: jest.fn(),
    getOrThrow: jest.fn(),
    update: jest.fn(),
    softDelete: jest.fn(),
  };
  let service: GymMemberRecordsService;

  beforeEach(() => {
    jest.resetAllMocks();
    store.userId.mockReturnValue('u1');
    store.list.mockResolvedValue([]);
    store.create.mockImplementation(async (_name: string, fields: object) => ({
      id: 'new',
      createdAt: '2026-10-01T10:00:00.000Z',
      updatedAt: '2026-10-01T10:00:00.000Z',
      ...fields,
    }));
    store.update.mockImplementation(async (_name: string, _id: string, _code: string, _msg: string, patch: object) => ({
      id: 'x',
      createdAt: '2026-10-01T10:00:00.000Z',
      ...patch,
    }));
    store.softDelete.mockImplementation(async (_name: string, id: string) => ({ id }));
    service = new GymMemberRecordsService(store as never);
  });

  it('lists only the member own wallet movements, newest first', async () => {
    store.list.mockResolvedValue([
      { id: 'a', userId: 'u1', type: 'deposit', amount: 100, createdAt: '2026-09-01T00:00:00.000Z' },
      { id: 'b', userId: 'u2', type: 'deposit', amount: 999, createdAt: '2026-09-03T00:00:00.000Z' },
      { id: 'c', userId: 'u1', type: 'debit', amount: 40, createdAt: '2026-09-02T00:00:00.000Z' },
    ]);
    const items = await service.listWallet();
    expect(items.map((item) => item.id)).toEqual(['c', 'a']);
    expect(items[0]).toMatchObject({ type: 'debit', amount: 40, status: 'completed' });
  });

  it('lists water history across days', async () => {
    store.list.mockResolvedValue([
      { id: 'a', userId: 'u1', amount: 250, unit: 'ml', date: '2026-09-01T08:00:00.000Z', createdAt: 'x' },
      { id: 'b', userId: 'u1', amountMl: 500, date: '2026-09-02T08:00:00.000Z', createdAt: 'x' },
      { id: 'c', userId: 'u2', amount: 300, date: '2026-09-03T08:00:00.000Z', createdAt: 'x' },
    ]);
    const items = await service.listWaterLogs();
    expect(items.map((item) => [item.id, item.amount, item.unit])).toEqual([
      ['b', 500, 'ml'],
      ['a', 250, 'ml'],
    ]);
  });

  it('answers not found for another member water log', async () => {
    store.getOrThrow.mockResolvedValue({ id: 'w', userId: 'u2' });
    await expect(service.removeWater('w')).rejects.toMatchObject({ code: ErrorCode.GYM_WATER_NOT_FOUND });
    expect(store.softDelete).not.toHaveBeenCalled();
  });

  it('recomputes BMI when a measurement is edited', async () => {
    store.getOrThrow.mockResolvedValue({ id: 'm', userId: 'u1', weight: 80, height: 180 });
    const updated = await service.updateMeasurement('m', { weight: 81 });
    const patch = store.update.mock.calls[0][4] as Record<string, unknown>;
    expect(patch['weight']).toBe(81);
    expect(patch['bmi']).toBeCloseTo(25, 0);
    expect(updated.weight).toBe(81);
  });

  it('creates a member-written plan with cleaned exercises', async () => {
    const plan = await service.createWorkoutPlan({
      title: ' Push ',
      exercises: [{ name: 'Bench', sets: 4, reps: '8-10', hack: 'x' }, { name: '' }],
    });
    expect(plan).toMatchObject({ title: 'Push', userId: 'u1', createdByMember: true, trainerId: null });
    expect(plan.exercises).toEqual([{ id: 'ex-1-0', name: 'Bench', sets: 4, reps: '8-10', dayName: '1. Gün' }]);
    expect(plan.days).toEqual([
      { id: 'day-1', name: '', order: 1, exercises: [{ id: 'ex-1-0', name: 'Bench', sets: 4, reps: '8-10' }] },
    ]);
  });

  it('stores structured days and the derived legacy list', async () => {
    await service.createWorkoutPlan({
      title: 'PPL',
      days: [
        { id: 'a', name: 'İtiş', exercises: [{ name: 'Bench', exerciseId: 'sys-ex-bench-press', sets: 3 }] },
        { id: 'b', name: 'Çekiş', exercises: [{ name: 'Row' }] },
      ],
    });
    const stored = store.create.mock.calls[0][1] as { days: { id: string; order: number }[]; exercises: { dayName: string }[] };
    expect(stored.days.map((day) => [day.id, day.order])).toEqual([
      ['a', 1],
      ['b', 2],
    ]);
    expect(stored.exercises.map((exercise) => exercise.dayName)).toEqual(['1. Gün: İtiş', '2. Gün: Çekiş']);
  });

  it('refuses day edits on a trainer-assigned plan but allows a status change', async () => {
    store.getOrThrow.mockResolvedValue({ id: 'p', userId: 'u1', createdByMember: false, exercises: [] });
    await expect(service.updateWorkoutPlan('p', { days: [] })).rejects.toMatchObject({ code: ErrorCode.GYM_MEMBER_FORBIDDEN });
    await expect(service.updateWorkoutPlan('p', { status: 'paused' })).resolves.toMatchObject({ status: 'paused' });
  });

  it('rejects a plan without a title', async () => {
    await expect(service.createWorkoutPlan({ title: '  ' })).rejects.toMatchObject({ code: ErrorCode.VALIDATION_ERROR });
  });

  it('lets the member only change the status of a trainer-assigned plan', async () => {
    store.getOrThrow.mockResolvedValue({ id: 'p', userId: 'u1', trainerId: 't1' });
    await expect(service.updateWorkoutPlan('p', { title: 'Mine now' })).rejects.toMatchObject({
      code: ErrorCode.GYM_MEMBER_FORBIDDEN,
    });
    await expect(service.removeWorkoutPlan('p')).rejects.toMatchObject({ code: ErrorCode.GYM_MEMBER_FORBIDDEN });
    const updated = await service.updateWorkoutPlan('p', { status: 'paused' });
    expect(updated.status).toBe('paused');
  });

  it('lets the member edit and delete a plan they wrote', async () => {
    store.getOrThrow.mockResolvedValue({ id: 'p', userId: 'u1', createdByMember: true });
    await expect(service.updateWorkoutPlan('p', { title: 'Legs' })).resolves.toMatchObject({ title: 'Legs' });
    await expect(service.removeWorkoutPlan('p')).resolves.toEqual({ id: 'p' });
  });

  describe('rescheduleAppointment', () => {
    const future = new Date(Date.now() + 2 * 86_400_000).toISOString();

    it('moves a booked appointment when the trainer is free', async () => {
      store.getOrThrow.mockResolvedValue({ id: 'a', userId: 'u1', trainerId: 't1', status: 'booked', duration: 60 });
      store.list.mockResolvedValue([{ id: 'a', trainerId: 't1', status: 'booked', appointmentTime: future, duration: 60 }]);
      const updated = await service.rescheduleAppointment('a', { appointmentTime: future });
      expect(updated.at).toBe(future);
    });

    it('refuses a slot the trainer already has', async () => {
      store.getOrThrow.mockResolvedValue({ id: 'a', userId: 'u1', trainerId: 't1', status: 'booked' });
      store.list.mockResolvedValue([{ id: 'b', trainerId: 't1', status: 'booked', appointmentTime: future, duration: 60 }]);
      await expect(service.rescheduleAppointment('a', { appointmentTime: future })).rejects.toMatchObject({
        code: ErrorCode.GYM_PT_CONFLICT,
      });
    });

    it('refuses a past time and a cancelled appointment', async () => {
      store.getOrThrow.mockResolvedValue({ id: 'a', userId: 'u1', status: 'booked' });
      await expect(
        service.rescheduleAppointment('a', { appointmentTime: '2020-01-01T10:00:00.000Z' }),
      ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_ERROR });
      store.getOrThrow.mockResolvedValue({ id: 'a', userId: 'u1', status: 'cancelled' });
      await expect(service.rescheduleAppointment('a', { appointmentTime: future })).rejects.toMatchObject({
        code: ErrorCode.VALIDATION_ERROR,
      });
    });

    it('answers not found for another member appointment', async () => {
      store.getOrThrow.mockResolvedValue({ id: 'a', userId: 'u2', status: 'booked' });
      await expect(service.rescheduleAppointment('a', { appointmentTime: future })).rejects.toMatchObject({
        code: ErrorCode.GYM_PT_NOT_FOUND,
      });
    });
  });
});
