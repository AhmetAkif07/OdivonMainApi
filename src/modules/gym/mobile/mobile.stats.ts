export function computeBmi(weightKg?: number | null, heightCm?: number | null): number | null {
  if (weightKg == null || heightCm == null || heightCm <= 0 || weightKg <= 0) {
    return null;
  }
  const meters = heightCm / 100;
  return Math.round((weightKg / (meters * meters)) * 10) / 10;
}

export function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

export function computeStreak(isoDates: string[], now = new Date()): number {
  const set = new Set(isoDates.map(dayKey).filter(Boolean));
  const cursor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (!set.has(cursor.toISOString().slice(0, 10))) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  let streak = 0;
  while (set.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

export const ACHIEVEMENT_DEFS = [
  { id: 'workouts_10', title: 'İlk 10 Antrenman', description: '10 antrenman tamamlandı', metric: 'workouts' as const, threshold: 10 },
  { id: 'workouts_30', title: 'İlk 30 Antrenman', description: '30 antrenman tamamlandı', metric: 'workouts' as const, threshold: 30 },
  { id: 'streak_7', title: '7 Day Streak', description: '7 gün üst üste spor', metric: 'streak' as const, threshold: 7 },
  { id: 'visits_20', title: 'Ayda 20 ziyaret', description: 'Bu ay 20 salon girişi', metric: 'visitsMonth' as const, threshold: 20 },
  { id: 'visits_50', title: '50 Gym Visits', description: 'Toplam 50 ziyaret', metric: 'visitsTotal' as const, threshold: 50 },
] as const;

export type AchievementDef = (typeof ACHIEVEMENT_DEFS)[number];
