import { calculateParkingQuote } from './parking-pricing';
import { ParkingTariff } from './parking.types';

const tariff = {
  id: 't1', version: 2, graceMinutes: 15, dailyCapKurus: 30_000, lostTicketFeeKurus: 45_000,
  bands: [
    { fromMinute: 1, toMinute: 60, priceKurus: 5_000 },
    { fromMinute: 61, toMinute: 180, priceKurus: 10_000 },
    { fromMinute: 181, toMinute: null, priceKurus: 40_000 },
  ],
} as ParkingTariff;

describe('parking pricing', () => {
  it('keeps the grace boundary free', () => {
    expect(calculateParkingQuote(tariff, { enteredAt: '2026-10-17T10:00:00Z', exitedAt: '2026-10-17T10:15:00Z' }).totalKurus).toBe(0);
  });

  it('uses the matching band after grace time', () => {
    expect(calculateParkingQuote(tariff, { enteredAt: '2026-10-17T10:00:00Z', exitedAt: '2026-10-17T11:15:00Z' }).totalKurus).toBe(5_000);
  });

  it('applies the daily cap', () => {
    const result = calculateParkingQuote(tariff, { enteredAt: '2026-10-17T10:00:00Z', exitedAt: '2026-10-18T09:59:00Z' });
    expect(result.totalKurus).toBe(30_000);
    expect(result.dailyCapApplied).toBe(true);
  });

  it('uses the fixed lost-ticket fee', () => {
    expect(calculateParkingQuote(tariff, { enteredAt: '2026-10-17T10:00:00Z', exitedAt: '2026-10-17T10:05:00Z', lostTicket: true }).totalKurus).toBe(45_000);
  });
});
