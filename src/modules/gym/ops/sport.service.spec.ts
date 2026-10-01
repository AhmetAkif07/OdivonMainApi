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

  let service: GymSportService;

  beforeEach(() => {
    jest.resetAllMocks();
    store.userId.mockReturnValue('u1');
    service = new GymSportService(store as never);
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
