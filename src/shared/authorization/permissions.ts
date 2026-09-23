export const PERMISSION_ACTIONS = ['view', 'create', 'update', 'delete'] as const;
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

export type PermissionGroup = 'clinic' | 'finance' | 'stock' | 'definitions' | 'admin';

export interface PermissionResourceDefinition {
  key: string;
  label: string;
  group: PermissionGroup;
}

export const PERMISSION_RESOURCES = [
  { key: 'customers', label: 'Müşteriler', group: 'clinic' },
  { key: 'patients', label: 'Hastalar', group: 'clinic' },
  { key: 'appointments', label: 'Randevular', group: 'clinic' },
  { key: 'examinations', label: 'Muayeneler', group: 'clinic' },
  { key: 'vaccineSchedules', label: 'Aşı takvimi', group: 'clinic' },
  { key: 'agenda', label: 'Ajanda', group: 'clinic' },
  { key: 'labDocuments', label: 'Lab dokümanları', group: 'clinic' },
  { key: 'files', label: 'Dosyalar', group: 'clinic' },
  { key: 'clinicParameters', label: 'Klinik parametreleri', group: 'admin' },
  { key: 'sales', label: 'Satışlar / Alışlar', group: 'finance' },
  { key: 'collections', label: 'Tahsilatlar / Ödemeler', group: 'finance' },
  { key: 'cashMovements', label: 'Kasa hareketleri', group: 'finance' },
  { key: 'stockMovements', label: 'Stok hareketleri', group: 'stock' },
  { key: 'demands', label: 'Stok talepleri', group: 'stock' },
  { key: 'products', label: 'Ürünler / Hizmetler', group: 'definitions' },
  { key: 'productCategories', label: 'Kategoriler', group: 'definitions' },
  { key: 'units', label: 'Birimler', group: 'definitions' },
  { key: 'taxes', label: 'KDV', group: 'definitions' },
  { key: 'stores', label: 'Depolar', group: 'definitions' },
  { key: 'suppliers', label: 'Tedarikçiler', group: 'definitions' },
  { key: 'paymentMethods', label: 'Ödeme yöntemleri', group: 'definitions' },
  { key: 'appointmentTypes', label: 'Randevu tipleri', group: 'definitions' },
  { key: 'customerGroups', label: 'Müşteri grupları', group: 'definitions' },
  { key: 'cashRegisters', label: 'Kasalar', group: 'definitions' },
  { key: 'vaccines', label: 'Aşı protokolleri', group: 'definitions' },
  { key: 'users', label: 'Kullanıcılar', group: 'admin' },
  { key: 'roles', label: 'Roller', group: 'admin' },
] as const satisfies readonly PermissionResourceDefinition[];

export type PermissionResource = (typeof PERMISSION_RESOURCES)[number]['key'];

export type PermissionMap = Partial<Record<PermissionResource, PermissionAction[]>>;

export const PERMISSION_GROUP_LABELS: Record<PermissionGroup, string> = {
  clinic: 'Klinik',
  finance: 'Finans',
  stock: 'Stok',
  definitions: 'Tanımlar',
  admin: 'Yönetim',
};

const RESOURCE_KEYS = new Set<string>(PERMISSION_RESOURCES.map((resource) => resource.key));
const ACTION_KEYS = new Set<string>(PERMISSION_ACTIONS);

export function isPermissionResource(value: string): value is PermissionResource {
  return RESOURCE_KEYS.has(value);
}

export function isPermissionAction(value: string): value is PermissionAction {
  return ACTION_KEYS.has(value);
}

export function fullPermissionMap(): PermissionMap {
  return Object.fromEntries(
    PERMISSION_RESOURCES.map((resource) => [resource.key, [...PERMISSION_ACTIONS]]),
  ) as PermissionMap;
}

/** Drops unknown keys, dedupes actions and adds `view` whenever any write action is granted. */
export function normalizePermissionMap(input: Record<string, unknown> | undefined | null): PermissionMap {
  const result: PermissionMap = {};
  if (!input) {
    return result;
  }
  for (const [resource, actions] of Object.entries(input)) {
    if (!isPermissionResource(resource) || !Array.isArray(actions)) {
      continue;
    }
    const granted = new Set(actions.filter((action): action is PermissionAction =>
      typeof action === 'string' && isPermissionAction(action),
    ));
    if (granted.size === 0) {
      continue;
    }
    granted.add('view');
    result[resource] = PERMISSION_ACTIONS.filter((action) => granted.has(action));
  }
  return result;
}

export function mergePermissionMaps(maps: PermissionMap[]): PermissionMap {
  const merged: Record<string, Set<PermissionAction>> = {};
  for (const map of maps) {
    for (const [resource, actions] of Object.entries(map)) {
      const set = (merged[resource] ??= new Set());
      for (const action of actions ?? []) {
        set.add(action);
      }
    }
  }
  return Object.fromEntries(
    Object.entries(merged).map(([resource, set]) => [
      resource,
      PERMISSION_ACTIONS.filter((action) => set.has(action)),
    ]),
  ) as PermissionMap;
}

export function hasPermission(
  permissions: PermissionMap | undefined,
  resource: PermissionResource,
  action: PermissionAction,
): boolean {
  return Boolean(permissions?.[resource]?.includes(action));
}
