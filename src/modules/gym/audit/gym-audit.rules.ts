import { TENANT_COLLECTION } from '../../../shared/firebase/firestore-path';

export type GymAuditVerb = 'create' | 'update' | 'delete' | 'action';

/** Controller path (without `gym/`) → module name shown in the log and its Firestore collection. */
export const GYM_AUDIT_ENTITIES: Record<string, { label: string; collection?: string }> = {
  members: { label: 'Üyeler', collection: TENANT_COLLECTION.gymMembers },
  staff: { label: 'Personel', collection: TENANT_COLLECTION.gymStaff },
  packages: { label: 'Paketler', collection: TENANT_COLLECTION.gymPackages },
  branches: { label: 'Şubeler', collection: TENANT_COLLECTION.gymBranches },
  info: { label: 'Salon bilgileri' },
  onboarding: { label: 'Kurulum' },
  classes: { label: 'Grup dersleri', collection: TENANT_COLLECTION.gymClassSchedules },
  appointments: { label: 'PT randevuları', collection: TENANT_COLLECTION.gymPtAppointments },
  workouts: { label: 'Antrenmanlar', collection: TENANT_COLLECTION.gymWorkoutPlans },
  'workout-templates': { label: 'Antrenman şablonları', collection: TENANT_COLLECTION.gymWorkoutTemplates },
  measurements: { label: 'Ölçümler', collection: TENANT_COLLECTION.gymMeasurements },
  water: { label: 'Su takibi', collection: TENANT_COLLECTION.gymWaterLogs },
  'guest-members': { label: 'Misafir üyeler', collection: TENANT_COLLECTION.gymGuestMembers },
  leads: { label: 'Aday hunisi', collection: TENANT_COLLECTION.gymGuestMembers },
  referrals: { label: 'Tavsiye programı' },
  disciplines: { label: 'Branşlar', collection: TENANT_COLLECTION.gymDisciplines },
  facilities: { label: 'Alanlar', collection: TENANT_COLLECTION.gymFacilities },
  equipment: { label: 'Ekipman', collection: TENANT_COLLECTION.gymEquipment },
  'member-documents': { label: 'Üye evrakları', collection: TENANT_COLLECTION.gymMemberDocuments },
  wallet: { label: 'Cüzdan' },
  shop: { label: 'Mağaza / POS' },
  suppliers: { label: 'Tedarikçiler', collection: TENANT_COLLECTION.gymSuppliers },
  accounting: { label: 'Muhasebe', collection: TENANT_COLLECTION.gymAccountingEntries },
  einvoice: { label: 'E-fatura' },
  access: { label: 'Turnike' },
  campaigns: { label: 'Kampanyalar', collection: TENANT_COLLECTION.gymCampaigns },
  sms: { label: 'SMS' },
  saas: { label: 'SaaS abonelik' },
  receivables: { label: 'Taksit / borç', collection: TENANT_COLLECTION.gymReceivables },
  mobile: { label: 'Üye uygulaması' },
};

/** Sub-resources whose `:id` lives in another collection than the controller's default. */
const SUB_COLLECTIONS: Record<string, string> = {
  'shop/products/:id': TENANT_COLLECTION.gymShopProducts,
  'shop/categories/:id': TENANT_COLLECTION.gymShopCategories,
  'shop/sales/:id': TENANT_COLLECTION.gymShopSales,
  'shop/sales/:id/refund': TENANT_COLLECTION.gymShopSales,
  'suppliers/categories/:id': TENANT_COLLECTION.gymSupplierCategories,
  'accounting/categories/:id': TENANT_COLLECTION.gymAccountingCategories,
  'einvoice/items/:id': TENANT_COLLECTION.gymEinvoiceItems,
  'access/gates/:id': TENANT_COLLECTION.gymTurnstileGates,
  'classes/:id/bookings/:bookingId': TENANT_COLLECTION.gymClassBookings,
};

/** Human-readable descriptions for the routes that matter most; the rest get a generic one. */
const LABELS: Record<string, string> = {
  'POST members': 'Üye oluşturuldu',
  'PATCH members/:id': 'Üye bilgileri güncellendi',
  'DELETE members/:id': 'Üye silindi',
  'POST members/:id/renew': 'Üyelik yenilendi',
  'POST members/:id/freeze': 'Üyelik donduruldu',
  'POST members/:id/cancel': 'Üyelik iptal edildi',
  'POST wallet': 'Cüzdan hareketi',
  'POST wallet/purchase': 'Paket satışı',
  'POST shop/checkout': 'Mağaza satışı',
  'POST shop/sales/:id/refund': 'Satış iadesi',
  'DELETE shop/sales/:id': 'Satış kaydı silindi',
  'POST receivables': 'Taksitli satış',
  'POST receivables/:id/payments': 'Taksit tahsilatı',
  'POST receivables/:id/cancel': 'Taksit planı iptal edildi',
  'PATCH sms/config': 'SMS ayarları değiştirildi',
  'POST sms/send': 'SMS gönderildi',
  'PATCH einvoice/config': 'E-fatura ayarları değiştirildi',
  'POST einvoice/items': 'E-fatura kesildi',
  'DELETE einvoice/items/:id': 'E-fatura silindi',
  'PATCH saas': 'SaaS aboneliği değiştirildi',
  'PATCH info': 'Salon bilgileri güncellendi',
  'POST onboarding/complete': 'Salon kurulumu tamamlandı',
  'POST access/scan': 'Turnike manuel geçiş',
  'POST access/commands': 'Turnike komutu gönderildi',
  'POST access/agents/pairing-codes': 'Turnike ajanı eşleme kodu üretildi',
  'DELETE access/agents/:id': 'Turnike ajanı iptal edildi',
  'POST access/sync/resync': 'Turnike yeniden senkronize edildi',
  'POST campaigns/broadcast': 'Kampanya duyurusu gönderildi',
  'POST mobile/membership/renew': 'Üye uygulamadan üyeliğini yeniledi',
};

const VERB_LABEL: Record<GymAuditVerb, string> = {
  create: 'Kayıt eklendi',
  update: 'Kayıt güncellendi',
  delete: 'Kayıt silindi',
  action: 'İşlem yapıldı',
};

/** Member-app routes worth an audit entry; the rest (water, workout logs…) are the member's own data. */
const MOBILE_AUDITED = new Set(['POST mobile/membership/renew', 'PATCH mobile/me']);
/** High-volume machine traffic that would drown the log. */
const SKIPPED = new Set(['POST access/logs']);

export interface GymAuditRoute {
  /** `gym/`-relative route pattern, e.g. `wallet/purchase` or `members/:id`. */
  path: string;
  method: string;
}

export function shouldAudit(route: GymAuditRoute): boolean {
  if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(route.method)) return false;
  const key = `${route.method} ${route.path}`;
  if (SKIPPED.has(key)) return false;
  if (route.path.startsWith('mobile')) return MOBILE_AUDITED.has(key);
  return true;
}

export function describeRoute(route: GymAuditRoute) {
  const key = `${route.method} ${route.path}`;
  const segments = route.path.split('/');
  const entityKey = segments[0] === 'access' ? 'access' : segments[0];
  const entity = GYM_AUDIT_ENTITIES[entityKey];
  const hasId = segments.includes(':id');
  const verb = verbOf(route.method, segments);
  const moduleLabel = entity?.label ?? entityKey;
  return {
    entity: entityKey,
    moduleLabel,
    verb,
    label: LABELS[key] ?? `${moduleLabel}: ${VERB_LABEL[verb].toLocaleLowerCase('tr')}`,
    collection: hasId ? (SUB_COLLECTIONS[route.path] ?? entity?.collection) : undefined,
  };
}

/** Sub-resource nouns: `POST shop/products` creates a product, `POST shop/checkout` is an action. */
const CREATABLE = new Set([
  'categories', 'products', 'gates', 'items', 'bookings', 'logs', 'disciplines', 'facilities', 'equipment',
]);

function verbOf(method: string, segments: string[]): GymAuditVerb {
  if (method === 'DELETE') return 'delete';
  if (method === 'PATCH' || method === 'PUT') return 'update';
  const tail = segments.at(-1) ?? '';
  if (segments.length === 1 || CREATABLE.has(tail)) return 'create';
  return 'action';
}

const SECRET_KEY = /pass(word)?|secret|token|api[-_]?key|private|credential|signature|cvv|cvc|card[-_]?(number|no)|authorization/i;
const MAX_STRING = 300;
const MAX_ARRAY = 25;
const MAX_DEPTH = 4;

export function maskNationalId(value: string): string {
  return value.length > 5 ? `${value.slice(0, 3)}${'*'.repeat(value.length - 5)}${value.slice(-2)}` : '***';
}

/** Copies request data into the log without secrets, uploaded files or unbounded blobs. */
export function sanitize(value: unknown, key = '', depth = 0): unknown {
  if (value === null || value === undefined) return value ?? null;
  if (SECRET_KEY.test(key)) return '[gizli]';
  if (typeof value === 'string') {
    if (key === 'nationalId') return maskNationalId(value);
    if (value.startsWith('data:')) return '[dosya]';
    return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
  }
  if (typeof value !== 'object') return value;
  if (depth >= MAX_DEPTH) return '[…]';
  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ARRAY).map((item) => sanitize(item, key, depth + 1));
    return value.length > MAX_ARRAY ? [...items, `… +${value.length - MAX_ARRAY}`] : items;
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, sanitize(v, k, depth + 1)]),
  );
}

const IGNORED_DIFF_KEYS = new Set(['updatedAt', 'updatedBy', 'createdAt', 'createdBy', 'id', 'tenantId']);

/** Field-level before/after for the fields that actually changed. */
export function diff(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): Record<string, { from: unknown; to: unknown }> | null {
  if (!before && !after) return null;
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of keys) {
    if (IGNORED_DIFF_KEYS.has(key)) continue;
    const from = before?.[key] ?? null;
    const to = after?.[key] ?? null;
    if (JSON.stringify(from) === JSON.stringify(to)) continue;
    changes[key] = { from: sanitize(from, key), to: sanitize(to, key) };
    if (Object.keys(changes).length >= 40) break;
  }
  return Object.keys(changes).length > 0 ? changes : null;
}
