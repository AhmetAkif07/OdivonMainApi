import { ErrorCode } from '../../../shared/errors/error-codes';
import { countLeaveDays, shiftsOverlap } from './staff.schedule';
import { StaffService } from './staff.service';

describe('staff schedule helpers', () => {
  it('treats an end before the start as an overnight shift', () => {
    const night = { date: '2026-11-03', startTime: '22:00', endTime: '08:00' };
    expect(shiftsOverlap(night, { date: '2026-11-04', startTime: '07:00', endTime: '12:00' })).toBe(true);
    expect(shiftsOverlap(night, { date: '2026-11-04', startTime: '08:00', endTime: '12:00' })).toBe(false);
  });

  it('does not charge Sundays as leave days', () => {
    // 2026-11-02 is a Monday, 2026-11-08 a Sunday.
    expect(countLeaveDays('2026-11-02', '2026-11-08')).toBe(6);
  });
});

describe('StaffService', () => {
  const shifts = { create: jest.fn(), save: jest.fn(), collect: jest.fn(), getByIdOrThrow: jest.fn() };
  const leaves = { create: jest.fn(), save: jest.fn(), collect: jest.fn(), getByIdOrThrow: jest.fn() };
  const identity = { listByCurrentTenant: jest.fn() };
  const tenant = { getUserId: () => 'admin' };
  let service: StaffService;

  beforeEach(() => {
    jest.resetAllMocks();
    identity.listByCurrentTenant.mockResolvedValue([
      { uid: 'u1', displayName: 'Dr. Ece', email: 'ece@x.com', status: 'active' },
    ]);
    shifts.collect.mockResolvedValue([]);
    leaves.collect.mockResolvedValue([]);
    shifts.create.mockImplementation(async (fields) => ({ id: 'sh1', ...fields }));
    leaves.create.mockImplementation(async (fields) => ({ id: 'lv1', ...fields }));
    leaves.save.mockImplementation(async (item) => item);
    service = new StaffService(shifts as never, leaves as never, identity as never, tenant as never);
  });

  it('rejects a shift that overlaps another one of the same person', async () => {
    shifts.collect.mockResolvedValue([
      { id: 'x', userId: 'u1', date: '2026-11-03', startTime: '09:00', endTime: '17:00' },
    ]);
    await expect(
      service.createShift({ userId: 'u1', date: '2026-11-03', startTime: '16:00', endTime: '20:00' }),
    ).rejects.toMatchObject({ code: ErrorCode.SCHEDULE_CONFLICT });
  });

  it('rejects a shift on an approved leave day', async () => {
    leaves.collect.mockResolvedValue([
      { id: 'l', userId: 'u1', status: 'approved', startDate: '2026-11-02', endDate: '2026-11-06' },
    ]);
    await expect(
      service.createShift({ userId: 'u1', date: '2026-11-04', startTime: '09:00', endTime: '17:00' }),
    ).rejects.toMatchObject({ code: ErrorCode.SCHEDULE_CONFLICT });
  });

  it('creates a pending leave with the computed day count, then approves it', async () => {
    const leave = await service.createLeave({ userId: 'u1', type: 'annual', startDate: '2026-11-02', endDate: '2026-11-08' });
    expect(leave).toMatchObject({ status: 'pending', days: 6, staffName: 'Dr. Ece' });
    leaves.getByIdOrThrow.mockResolvedValue(leave);
    const approved = await service.decideLeave('lv1', { status: 'approved' });
    expect(approved).toMatchObject({ status: 'approved', decidedBy: 'admin' });
  });

  it('rejects staff that does not belong to the clinic', async () => {
    await expect(
      service.createShift({ userId: 'stranger', date: '2026-11-03', startTime: '09:00', endTime: '17:00' }),
    ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_ERROR });
  });
});
