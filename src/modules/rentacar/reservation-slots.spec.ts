import { assertNoReservationConflict, rangesOverlap, reservationDayKeys } from './reservation-slots';

describe('rent reservation slots', () => {
  it('returns every UTC day touched by the reservation', () => {
    expect(reservationDayKeys('vehicle-1', '2026-10-01T22:00:00Z', '2026-10-03T08:00:00Z')).toEqual([
      'vehicle-1_2026-10-01', 'vehicle-1_2026-10-02', 'vehicle-1_2026-10-03',
    ]);
  });

  it('treats adjacent ranges as available', () => {
    expect(rangesOverlap('2026-10-01T10:00:00Z', '2026-10-02T10:00:00Z', '2026-10-02T10:00:00Z', '2026-10-03T10:00:00Z')).toBe(false);
  });

  it('rejects an overlap from another reservation', () => {
    expect(() => assertNoReservationConflict(
      [{ reservationId: 'r1', startAt: '2026-10-01T10:00:00Z', endAt: '2026-10-03T10:00:00Z' }],
      { reservationId: 'r2', startAt: '2026-10-02T10:00:00Z', endAt: '2026-10-04T10:00:00Z' },
    )).toThrow('Araç seçilen tarih aralığında müsait değil.');
  });
});
