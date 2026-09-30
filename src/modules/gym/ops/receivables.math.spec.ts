import {
  addMonths,
  allocatePayment,
  buildSchedule,
  gymToday,
  isIsoDate,
  planStanding,
  remainingOf,
} from './receivables.math';

describe('receivables math', () => {
  it('clamps month ends and keeps the original day afterwards', () => {
    expect(addMonths('2026-01-31', 1, 31)).toBe('2026-02-28');
    expect(addMonths('2026-01-31', 2, 31)).toBe('2026-03-31');
    expect(addMonths('2028-01-31', 1, 31)).toBe('2028-02-29');
    expect(addMonths('2026-11-15', 3)).toBe('2027-02-15');
  });

  it('builds a monthly schedule that sums to the total to the kuruş', () => {
    const schedule = buildSchedule(1000, 3, '2026-10-31');
    expect(schedule.map((item) => item.amount)).toEqual([333.33, 333.33, 333.34]);
    expect(schedule.map((item) => item.dueDate)).toEqual(['2026-10-31', '2026-11-30', '2026-12-31']);
    expect(remainingOf(schedule)).toBe(1000);
  });

  it('applies a payment oldest-first across installments, allowing partials', () => {
    const schedule = buildSchedule(900, 3, '2026-10-01');
    const afterFirst = allocatePayment(schedule, 450, '2026-10-02T10:00:00Z');
    expect(afterFirst.map((item) => [item.paidAmount, item.status])).toEqual([
      [300, 'paid'],
      [150, 'partial'],
      [0, 'pending'],
    ]);
    expect(afterFirst[0].paidAt).toBe('2026-10-02T10:00:00Z');
    expect(afterFirst[1].paidAt).toBeNull();
    const afterSecond = allocatePayment(afterFirst, 450, '2026-11-01T10:00:00Z');
    expect(afterSecond.every((item) => item.status === 'paid')).toBe(true);
    expect(remainingOf(afterSecond)).toBe(0);
  });

  it('handles float-unsafe amounts exactly', () => {
    const schedule = buildSchedule(0.3, 3, '2026-10-01');
    const paid = allocatePayment(allocatePayment(schedule, 0.1, 'a'), 0.2, 'b');
    expect(remainingOf(paid)).toBe(0);
  });

  it('rejects overpayment and non-positive payments', () => {
    const schedule = buildSchedule(100, 2, '2026-10-01');
    expect(() => allocatePayment(schedule, 100.01, 'x')).toThrow('exceeds');
    expect(() => allocatePayment(schedule, 0, 'x')).toThrow('positive');
  });

  it('reports overdue amount, days late and the next due installment', () => {
    const schedule = allocatePayment(buildSchedule(900, 3, '2026-08-10'), 100, 'x');
    const standing = planStanding(schedule, '2026-09-30');
    expect(standing.remainingAmount).toBe(800);
    expect(standing.overdueCount).toBe(2);
    expect(standing.overdueAmount).toBe(500);
    expect(standing.maxDaysLate).toBe(51);
    expect(standing.nextDueDate).toBe('2026-08-10');
    expect(standing.nextDueAmount).toBe(200);
    expect(standing.installments[2]).toMatchObject({ dueDate: '2026-10-10', overdue: false, daysLate: 0 });
  });

  it('does not count an installment due today as late', () => {
    const standing = planStanding(buildSchedule(100, 1, '2026-09-30'), '2026-09-30');
    expect(standing.overdueCount).toBe(0);
  });

  it('uses the Istanbul calendar day and validates dates', () => {
    expect(gymToday(new Date('2026-09-30T21:30:00Z'))).toBe('2026-10-01');
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('2026-02-28')).toBe(true);
  });
});
