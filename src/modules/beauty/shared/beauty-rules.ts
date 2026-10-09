export interface TimeRange { startAt: string; endAt: string; staffId?: string; roomId?: string; deviceId?: string; customerId?: string; status?: string; }

const CLOSED = new Set(['cancelled', 'no-show']);

export function rangesOverlap(left: TimeRange, right: TimeRange): boolean {
  return new Date(left.startAt).getTime() < new Date(right.endAt).getTime()
    && new Date(right.startAt).getTime() < new Date(left.endAt).getTime();
}

export function conflictReason(candidate: TimeRange, existing: readonly TimeRange[]): string | null {
  for (const item of existing) {
    if (CLOSED.has(item.status ?? '') || !rangesOverlap(candidate, item)) continue;
    if (candidate.staffId && candidate.staffId === item.staffId) return 'Uzman bu saatte musait degil.';
    if (candidate.roomId && candidate.roomId === item.roomId) return 'Oda bu saatte musait degil.';
    if (candidate.deviceId && candidate.deviceId === item.deviceId) return 'Cihaz bu saatte musait degil.';
    if (candidate.customerId && candidate.customerId === item.customerId) return 'Musterinin ayni saatte baska randevusu var.';
  }
  return null;
}

export function nextSessionDue(performedAt: string, intervalDays: number): string {
  const next = new Date(performedAt);
  next.setUTCDate(next.getUTCDate() + intervalDays);
  return next.toISOString();
}

export function commissionAmount(amount: number, rate: number): number {
  return Math.round(amount * rate) / 100;
}

export function refundableAmount(paid: number, totalSessions: number, usedSessions: number): number {
  if (paid < 0 || totalSessions <= 0 || usedSessions < 0 || usedSessions > totalSessions) throw new Error('Invalid refund inputs');
  return Math.round((paid * (totalSessions - usedSessions) / totalSessions) * 100) / 100;
}
