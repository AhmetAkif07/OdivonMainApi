import { PRODUCT_MODULES, ProductModule } from './constants';

export const PERMISSION_ACTIONS = ['view', 'create', 'update', 'delete'] as const;
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

export type PermissionGroup = 'clinic' | 'finance' | 'stock' | 'definitions' | 'admin' | 'gym' | 'spa' | 'hair' | 'apm';

export interface PermissionResourceDefinition {
  key: string;
  label: string;
  group: PermissionGroup;
  modules?: readonly ProductModule[];
}

export const PERMISSION_RESOURCES = [
  { key: 'customers', label: 'Müşteriler', group: 'clinic', modules: ['vet'] },
  { key: 'consentForms', label: 'Onam Formları', group: 'clinic', modules: ['vet'] },
  { key: 'crm', label: 'CRM & Bildirimler', group: 'clinic', modules: ['vet'] },
  { key: 'petHotel', label: 'Pet Otel & Pansiyon', group: 'clinic', modules: ['vet'] },
  { key: 'hotelRooms', label: 'Otel Odaları', group: 'clinic', modules: ['vet'] },
  { key: 'grooming', label: 'Pet Kuaför & Bakım', group: 'clinic', modules: ['vet'] },
  { key: 'patients', label: 'Hastalar', group: 'clinic', modules: ['vet'] },
  { key: 'appointments', label: 'Randevular', group: 'clinic', modules: ['vet'] },
  { key: 'examinations', label: 'Muayeneler', group: 'clinic', modules: ['vet'] },
  { key: 'vaccineSchedules', label: 'Aşı takvimi', group: 'clinic', modules: ['vet'] },
  { key: 'agenda', label: 'Ajanda', group: 'clinic', modules: ['vet'] },
  { key: 'labDocuments', label: 'Lab dokümanları', group: 'clinic', modules: ['vet'] },
  { key: 'files', label: 'Dosyalar', group: 'clinic', modules: ['vet'] },
  { key: 'clinicParameters', label: 'Klinik parametreleri', group: 'admin', modules: ['vet'] },
  { key: 'sales', label: 'Satışlar / Alışlar', group: 'finance', modules: ['vet'] },
  { key: 'collections', label: 'Tahsilatlar / Ödemeler', group: 'finance', modules: ['vet'] },
  { key: 'cashMovements', label: 'Kasa hareketleri', group: 'finance', modules: ['vet'] },
  { key: 'stockMovements', label: 'Stok hareketleri', group: 'stock', modules: ['vet'] },
  { key: 'demands', label: 'Stok talepleri', group: 'stock', modules: ['vet'] },
  { key: 'products', label: 'Ürünler / Hizmetler', group: 'definitions', modules: ['vet'] },
  { key: 'productCategories', label: 'Kategoriler', group: 'definitions', modules: ['vet'] },
  { key: 'units', label: 'Birimler', group: 'definitions', modules: ['vet'] },
  { key: 'taxes', label: 'KDV', group: 'definitions', modules: ['vet'] },
  { key: 'stores', label: 'Depolar', group: 'definitions', modules: ['vet'] },
  { key: 'suppliers', label: 'Tedarikçiler', group: 'definitions', modules: ['vet'] },
  { key: 'paymentMethods', label: 'Ödeme yöntemleri', group: 'definitions', modules: ['vet'] },
  { key: 'appointmentTypes', label: 'Randevu tipleri', group: 'definitions', modules: ['vet'] },
  { key: 'customerGroups', label: 'Müşteri grupları', group: 'definitions', modules: ['vet'] },
  { key: 'cashRegisters', label: 'Kasalar', group: 'definitions', modules: ['vet'] },
  { key: 'vaccines', label: 'Aşı protokolleri', group: 'definitions', modules: ['vet'] },
  { key: 'users', label: 'Kullanıcılar', group: 'admin' },
  { key: 'roles', label: 'Roller', group: 'admin' },
  { key: 'members', label: 'Üyeler', group: 'gym', modules: ['gym'] },
  { key: 'packages', label: 'Paketler', group: 'gym', modules: ['gym'] },
  { key: 'branches', label: 'Şubeler', group: 'gym', modules: ['gym'] },
  { key: 'staff', label: 'Personel', group: 'gym', modules: ['gym'] },
  { key: 'gymInfo', label: 'Salon bilgileri', group: 'gym', modules: ['gym'] },
  { key: 'classes', label: 'Grup dersleri', group: 'gym', modules: ['gym'] },
  { key: 'gymAppointments', label: 'PT randevuları', group: 'gym', modules: ['gym'] },
  { key: 'workouts', label: 'Antrenmanlar', group: 'gym', modules: ['gym'] },
  { key: 'measurements', label: 'Vücut ölçümleri', group: 'gym', modules: ['gym'] },
  { key: 'water', label: 'Su takibi', group: 'gym', modules: ['gym'] },
  { key: 'wallet', label: 'Cüzdan', group: 'gym', modules: ['gym'] },
  { key: 'receivables', label: 'Taksit / borç takibi', group: 'gym', modules: ['gym'] },
  { key: 'shop', label: 'Mağaza / POS', group: 'gym', modules: ['gym'] },
  { key: 'accounting', label: 'Muhasebe', group: 'gym', modules: ['gym'] },
  { key: 'accessControl', label: 'Turnike', group: 'gym', modules: ['gym'] },
  { key: 'campaigns', label: 'Kampanyalar', group: 'gym', modules: ['gym'] },
  { key: 'guestMembers', label: 'Misafir üyeler', group: 'gym', modules: ['gym'] },
  { key: 'disciplines', label: 'Branş ve ekipman', group: 'gym', modules: ['gym'] },
  { key: 'gymSuppliers', label: 'Tedarikçiler', group: 'gym', modules: ['gym'] },
  { key: 'memberDocuments', label: 'Üye evrakları', group: 'gym', modules: ['gym'] },
  { key: 'sms', label: 'SMS', group: 'gym', modules: ['gym'] },
  { key: 'eInvoice', label: 'E-fatura', group: 'gym', modules: ['gym'] },
  { key: 'saas', label: 'SaaS abonelik', group: 'gym', modules: ['gym'] },
  { key: 'gymAudit', label: 'İşlem kaydı', group: 'gym', modules: ['gym'] },
  { key: 'reminders', label: 'Hatırlatmalar', group: 'gym', modules: ['gym'] },
  { key: 'reports', label: 'Raporlar (doluluk, churn)', group: 'gym', modules: ['gym'] },
  { key: 'spaCustomers', label: 'Müşteriler', group: 'spa', modules: ['spa'] },
  { key: 'spaAppointments', label: 'Randevular', group: 'spa', modules: ['spa'] },
  { key: 'spaCatalog', label: 'Hizmet / Oda / Ürün', group: 'spa', modules: ['spa'] },
  { key: 'spaStock', label: 'Stok hareketleri', group: 'spa', modules: ['spa'] },
  { key: 'spaStaff', label: 'Personel', group: 'spa', modules: ['spa'] },
  { key: 'spaLeaves', label: 'İzinler', group: 'spa', modules: ['spa'] },
  { key: 'spaTasks', label: 'Görevler', group: 'spa', modules: ['spa'] },
  { key: 'spaPackages', label: 'Paketler', group: 'spa', modules: ['spa'] },
  { key: 'spaSessions', label: 'Seanslar / POS', group: 'spa', modules: ['spa'] },
  { key: 'spaPayments', label: 'Ödemeler', group: 'spa', modules: ['spa'] },
  { key: 'spaExpenses', label: 'Giderler', group: 'spa', modules: ['spa'] },
  { key: 'spaCashRegister', label: 'Kasa', group: 'spa', modules: ['spa'] },
  { key: 'spaCommissions', label: 'Prim / Komisyon', group: 'spa', modules: ['spa'] },
  { key: 'spaSettings', label: 'İşletme ayarları', group: 'spa', modules: ['spa'] },
  { key: 'spaAudit', label: 'İşlem geçmişi', group: 'spa', modules: ['spa'] },
  { key: 'hairCustomers', label: 'Müşteriler', group: 'hair', modules: ['hair'] },
  { key: 'hairAppointments', label: 'Randevular', group: 'hair', modules: ['hair'] },
  { key: 'hairCatalog', label: 'Hizmet / Kategori', group: 'hair', modules: ['hair'] },
  { key: 'hairStock', label: 'Ürün / Stok', group: 'hair', modules: ['hair'] },
  { key: 'hairStaff', label: 'Personel', group: 'hair', modules: ['hair'] },
  { key: 'hairLeaves', label: 'İzinler', group: 'hair', modules: ['hair'] },
  { key: 'hairPackages', label: 'Paketler', group: 'hair', modules: ['hair'] },
  { key: 'hairSessions', label: 'Seanslar / POS', group: 'hair', modules: ['hair'] },
  { key: 'hairPayments', label: 'Ödemeler', group: 'hair', modules: ['hair'] },
  { key: 'hairExpenses', label: 'Giderler', group: 'hair', modules: ['hair'] },
  { key: 'hairCashRegister', label: 'Kasa', group: 'hair', modules: ['hair'] },
  { key: 'hairCommissions', label: 'Prim / Komisyon', group: 'hair', modules: ['hair'] },
  { key: 'hairFormulas', label: 'Saç formülleri', group: 'hair', modules: ['hair'] },
  { key: 'hairSettings', label: 'İşletme ayarları', group: 'hair', modules: ['hair'] },
  { key: 'hairReports', label: 'Raporlar', group: 'hair', modules: ['hair'] },
  { key: 'hairBranches', label: 'Şubeler', group: 'hair', modules: ['hair'] },
  { key: 'hairDashboard', label: 'Gösterge paneli', group: 'hair', modules: ['hair'] },
  { key: 'hairAudit', label: 'İşlem geçmişi', group: 'hair', modules: ['hair'] },
  { key: 'apmDashboard', label: 'APM gösterge paneli', group: 'apm', modules: ['apm'] },
  { key: 'apmAppointments', label: 'APM randevuları', group: 'apm', modules: ['apm'] },
] as const satisfies readonly PermissionResourceDefinition[];

export type PermissionResource = (typeof PERMISSION_RESOURCES)[number]['key'];

export type PermissionMap = Partial<Record<PermissionResource, PermissionAction[]>>;

export const PERMISSION_GROUP_LABELS: Record<PermissionGroup, string> = {
  clinic: 'Klinik',
  finance: 'Finans',
  stock: 'Stok',
  definitions: 'Tanımlar',
  admin: 'Yönetim',
  gym: 'Salon',
  spa: 'Spa',
  hair: 'Kuaför',
  apm: 'Randevu Yönetimi',
};

export function resourcesForModules(
  modules: readonly ProductModule[],
): (typeof PERMISSION_RESOURCES)[number][] {
  return PERMISSION_RESOURCES.filter((resource) => {
    const allowed = 'modules' in resource && resource.modules ? resource.modules : PRODUCT_MODULES;
    return modules.some((module) => (allowed as readonly ProductModule[]).includes(module));
  });
}

const RESOURCE_KEYS = new Set<string>(PERMISSION_RESOURCES.map((resource) => resource.key));
const ACTION_KEYS = new Set<string>(PERMISSION_ACTIONS);

export function isPermissionResource(value: string): value is PermissionResource {
  return RESOURCE_KEYS.has(value);
}

export function isPermissionAction(value: string): value is PermissionAction {
  return ACTION_KEYS.has(value);
}

export function fullPermissionMap(modules?: readonly ProductModule[]): PermissionMap {
  const resources = modules?.length ? resourcesForModules(modules) : PERMISSION_RESOURCES;
  return Object.fromEntries(
    resources.map((resource) => [resource.key, [...PERMISSION_ACTIONS]]),
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
