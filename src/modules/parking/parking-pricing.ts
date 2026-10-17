import { ParkingQuote, ParkingTariff } from './parking.types';

export interface QuoteInput {
  enteredAt: string;
  exitedAt: string;
  lostTicket?: boolean;
}

export function calculateParkingQuote(
  tariff: Pick<ParkingTariff, 'id' | 'version' | 'graceMinutes' | 'dailyCapKurus' | 'lostTicketFeeKurus' | 'bands'>,
  input: QuoteInput,
  calculatedAt = new Date().toISOString(),
): ParkingQuote {
  const entered = Date.parse(input.enteredAt);
  const exited = Date.parse(input.exitedAt);
  if (!Number.isFinite(entered) || !Number.isFinite(exited) || exited < entered) {
    throw new Error('Exit time must be after entry time');
  }
  const durationMinutes = Math.max(0, Math.ceil((exited - entered) / 60_000));
  if (input.lostTicket) {
    return quote(tariff, durationMinutes, tariff.lostTicketFeeKurus, false, calculatedAt, 'Kayıp bilet');
  }
  if (durationMinutes <= tariff.graceMinutes) {
    return quote(tariff, durationMinutes, 0, false, calculatedAt, 'Ücretsiz süre');
  }
  const chargeable = durationMinutes - tariff.graceMinutes;
  const fullDays = Math.floor(chargeable / 1440);
  const remainder = chargeable % 1440;
  const dayPrice = priceForMinutes(tariff.bands, 1440);
  const rawDayPrice = tariff.dailyCapKurus === null ? dayPrice : Math.min(dayPrice, tariff.dailyCapKurus);
  const remainderPrice = remainder === 0 ? 0 : priceForMinutes(tariff.bands, remainder);
  const cappedRemainder = tariff.dailyCapKurus === null ? remainderPrice : Math.min(remainderPrice, tariff.dailyCapKurus);
  const subtotal = fullDays * rawDayPrice + cappedRemainder;
  const capApplied = tariff.dailyCapKurus !== null && (dayPrice > tariff.dailyCapKurus || remainderPrice > tariff.dailyCapKurus);
  return quote(tariff, durationMinutes, subtotal, capApplied, calculatedAt, `${durationMinutes} dakika park`);
}

function priceForMinutes(bands: ParkingTariff['bands'], minutes: number): number {
  const ordered = [...bands].sort((a, b) => a.fromMinute - b.fromMinute);
  const band = ordered.find((item) => minutes >= item.fromMinute && (item.toMinute === null || minutes <= item.toMinute));
  if (!band) throw new Error('No tariff band covers the parking duration');
  return band.priceKurus;
}

function quote(
  tariff: Pick<ParkingTariff, 'id' | 'version' | 'graceMinutes'>,
  durationMinutes: number,
  amount: number,
  dailyCapApplied: boolean,
  calculatedAt: string,
  label: string,
): ParkingQuote {
  return {
    currency: 'TRY', durationMinutes, graceMinutes: tariff.graceMinutes,
    subtotalKurus: amount, dailyCapApplied, totalKurus: amount,
    tariffId: tariff.id, tariffVersion: tariff.version, calculatedAt,
    lines: [{ label, amountKurus: amount }],
  };
}

