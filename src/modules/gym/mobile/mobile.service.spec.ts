import { GymMobileService, daysRemaining } from './mobile.service';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { computeBmi, computeStreak } from './mobile.stats';

describe('GymMobileService', () => {
  const store = {
    userId: jest.fn().mockReturnValue('u1'),
    tenantId: jest.fn().mockReturnValue('t1'),
    list: jest.fn(),
    create: jest.fn(),
    getOrThrow: jest.fn(),
    update: jest.fn(),
    collection: jest.fn(),
    save: jest.fn(),
    softDelete: jest.fn(),
  };
  const members = {
    getByIdOrThrow: jest.fn(),
    save: jest.fn(),
  };
  const packages = { list: jest.fn() };
  const staff = { getByIdOrThrow: jest.fn() };
  let service: GymMobileService;

  const member = {
    uid: 'u1',
    displayName: 'Ahmet Akif',
    photoURL: null,
    email: 'ahmet@example.com',
    phone: null,
    gender: 'male',
    birthDate: null,
    language: 'tr',
    branchName: null,
    trainerId: null,
    trainerName: 'Trainer',
    emergencyContactName: null,
    emergencyContactPhone: null,
    emergencyContactRelation: null,
    memberNumber: '10001',
    membershipStatus: 'active',
    membershipStartsAt: '2026-09-01T00:00:00.000Z',
    membershipEndsAt: new Date(Date.now() + 23 * 86400000).toISOString(),
    packageLabel: '12 Aylık',
    packagePrice: 18000,
    notes: null,
  };

  beforeEach(() => {
    jest.resetAllMocks();
    store.userId.mockReturnValue('u1');
    store.tenantId.mockReturnValue('t1');
    members.getByIdOrThrow.mockResolvedValue(member);
    packages.list.mockResolvedValue([
      {
        name: '12 Aylık',
        features: ['Sauna'],
        maxFreeze: 14,
        sessionCount: 20,
        isUnlimitedSessions: false,
        checkInStartTime: '06:00',
        checkInEndTime: '23:00',
        allowedDays: [1, 2, 3, 4, 5],
      },
    ]);
    store.list.mockResolvedValue([]);
    store.create.mockImplementation(async (_name: string, fields: object) => ({
      id: 'new',
      createdAt: new Date().toISOString(),
      ...fields,
    }));
    store.save.mockImplementation(async (_name: string, item: object) => item);
    staff.getByIdOrThrow.mockRejectedValue(new Error('missing'));
    service = new GymMobileService(store as never, members as never, packages as never, staff as never);
  });

  it('builds a self-scoped home payload', async () => {
    store.list.mockImplementation(async (name: string) => {
      if (name === 'gymWorkoutPlans') {
        return [{ id: 'p1', userId: 'u1', status: 'active', title: 'Göğüs & Triceps', trainerName: 'Ahmet' }];
      }
      if (name === 'gymPtAppointments') {
        return [
          {
            id: 'a1',
            userId: 'u1',
            status: 'booked',
            appointmentTime: new Date(Date.now() + 3600000).toISOString(),
            trainerName: 'Ahmet Yılmaz',
            type: 'PT',
          },
        ];
      }
      if (name === 'gymMeasurements') {
        return [{ id: 'm1', userId: 'u1', weight: 82.4, date: '2026-09-20T00:00:00.000Z', createdAt: '2026-09-20' }];
      }
      if (name === 'gymAccessLogs') {
        return [];
      }
      if (name === 'gymCampaigns') {
        return [{ id: 'c1', status: 'active', channels: ['in_app'], title: 'Yeni sauna saatleri', description: '' }];
      }
      return [];
    });

    const home = await service.home();
    expect(home.member.firstName).toBe('Ahmet');
    expect(home.todayWorkout?.title).toBe('Göğüs & Triceps');
    expect(home.nextAppointment?.trainerName).toBe('Ahmet Yılmaz');
    expect(home.lastMeasurement?.weightKg).toBe(82.4);
    expect(home.announcements[0].title).toBe('Yeni sauna saatleri');
  });

  it('does not leak another member workout', async () => {
    store.getOrThrow.mockResolvedValue({ id: 'p2', userId: 'other', title: 'Secret' });
    await expect(service.getWorkout('p2')).rejects.toMatchObject({ code: ErrorCode.GYM_WORKOUT_NOT_FOUND });
  });

  it('returns previous set for an exercise', async () => {
    store.getOrThrow.mockResolvedValue({
      id: 'p1',
      userId: 'u1',
      title: 'Göğüs',
      status: 'active',
      exercises: [{ name: 'Bench Press', sets: 4, reps: 10, weight: 60 }],
    });
    store.list.mockResolvedValue([
      {
        id: 'log1',
        userId: 'u1',
        exerciseName: 'Bench Press',
        performedAt: '2026-09-01T10:00:00.000Z',
        createdAt: '2026-09-01T10:00:00.000Z',
        sets: [
          { setIndex: 1, kg: 50, reps: 10, completed: true },
          { setIndex: 4, kg: 65, reps: 8, completed: true },
        ],
      },
      {
        id: 'log0',
        userId: 'u1',
        exerciseName: 'Bench Press',
        performedAt: '2026-08-20T10:00:00.000Z',
        createdAt: '2026-08-20T10:00:00.000Z',
        sets: [{ setIndex: 1, kg: 70, reps: 6, completed: true }],
      },
    ]);
    const workout = await service.getWorkout('p1');
    expect(workout.exercises[0].previous).toEqual({
      kg: 70,
      reps: 6,
      at: '2026-08-20T10:00:00.000Z',
    });
  });

  it('blocks cancelling someone else appointment', async () => {
    store.getOrThrow.mockResolvedValue({ id: 'a2', userId: 'other', status: 'booked' });
    await expect(service.cancelAppointment('a2', {})).rejects.toMatchObject({
      code: ErrorCode.GYM_PT_NOT_FOUND,
    });
  });

  it('computes remaining membership days', () => {
    expect(daysRemaining(null)).toBeNull();
    expect(daysRemaining(new Date(Date.now() + 2.2 * 86400000).toISOString())).toBeGreaterThanOrEqual(2);
  });

  it('computes bmi from weight and height', () => {
    expect(computeBmi(80, 180)).toBe(24.7);
    expect(computeBmi(null, 180)).toBeNull();
    expect(computeBmi(80, 0)).toBeNull();
  });

  it('computes consecutive day streak in utc', () => {
    const now = new Date(Date.UTC(2026, 8, 27, 12, 0, 0));
    expect(
      computeStreak(['2026-09-27T08:00:00.000Z', '2026-09-26T08:00:00.000Z', '2026-09-25T08:00:00.000Z'], now),
    ).toBe(3);
    expect(computeStreak(['2026-09-20T08:00:00.000Z'], now)).toBe(0);
  });

  it('rejects waitlist when already queued', async () => {
    store.getOrThrow.mockResolvedValue({ id: 'c1', name: 'Yoga' });
    store.list.mockResolvedValue([{ id: 'w1', userId: 'u1', classScheduleId: 'c1' }]);
    await expect(service.joinWaitlist('c1')).rejects.toMatchObject({ code: ErrorCode.GYM_WAITLIST_EXISTS });
  });

  it('does not delete another member progress photo', async () => {
    store.getOrThrow.mockResolvedValue({ id: 'ph1', userId: 'other', storagePath: 'x' });
    await expect(service.deleteProgressPhoto('ph1')).rejects.toMatchObject({
      code: ErrorCode.GYM_PHOTO_NOT_FOUND,
    });
    expect(store.softDelete).not.toHaveBeenCalled();
  });
});
