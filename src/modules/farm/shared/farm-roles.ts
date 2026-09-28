/** Farm roles of the OdivonFARM client (`AppRole`). The tenant owner always acts as `admin`. */
export const FARM_ROLES = ['admin', 'yonetici', 'veteriner', 'saha', 'muhasebe', 'okuyucu'] as const;
export type FarmRole = (typeof FARM_ROLES)[number];

export const FARM_ROLE_TITLES: Record<FarmRole, string> = {
  admin: 'Çiftlik Sahibi & Yönetici',
  yonetici: 'İşletme Müdürü',
  veteriner: 'Veteriner Hekim',
  saha: 'Saha & Bakım Personeli',
  muhasebe: 'Muhasebe Sorumlusu',
  okuyucu: 'Gözlemci / Stajyer',
};

export function isFarmRole(value: unknown): value is FarmRole {
  return typeof value === 'string' && (FARM_ROLES as readonly string[]).includes(value);
}

/** Mirrors the old Firestore rule `canWriteFarmData`: everyone but read-only members may write. */
export function canWriteFarmData(role: FarmRole | null): boolean {
  return role !== null && role !== 'okuyucu';
}
