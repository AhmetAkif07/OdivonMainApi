import { GymSportService } from './sport.service';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { AppException } from '../../../shared/errors/app.exception';

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

  let service: GymSportService;

  beforeEach(() => {
    jest.resetAllMocks();
    store.userId.mockReturnValue('u1');
    service = new GymSportService(store as never);
  });

  it('rejects booking when class is full', async () => {
    store.getOrThrow.mockResolvedValue({
      id: 'c1',
      capacity: 1,
      currentBookings: 1,
      enrolledMemberIds: ['u0'],
    });

    await expect(service.bookClass('c1', { userId: 'u2' })).rejects.toBeInstanceOf(AppException);
    await expect(service.bookClass('c1', { userId: 'u2' })).rejects.toMatchObject({
      code: ErrorCode.GYM_CLASS_FULL,
    });
    expect(store.create).not.toHaveBeenCalled();
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
});
