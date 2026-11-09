/**
 * SaaS altyapı kaydı: her Odivon ürün ailesinin hangi API'yi ve hangi Firebase projesini
 * kullandığı. Varsayılanlar koddadır (`DEFAULT_BACKENDS`); panelden yapılan değişiklikler
 * `platformBackends/{id}` belgesinde tutulur ve varsayılanın üzerine yazılır.
 *
 * Harici API'lerin servis tokenları asla Firestore'a veya tarayıcıya yazılmaz; yalnız
 * `PLATFORM_BACKEND_TOKENS` ortam değişkeninde (JSON: {"erp":"..."}) durur.
 */
export const TENANT_SOURCES = ['main', 'remote', 'none'] as const;
export type TenantSource = (typeof TENANT_SOURCES)[number];

export interface PlatformBackend {
  id: string;
  name: string;
  description: string | null;
  /** Ürün etiketleri (ör. "Spor Salonu", "Ön Muhasebe"). */
  products: string[];
  /** Herkese açık API kökü (gösterim için). Yalnız Firebase kullanan ürünlerde null. */
  apiUrl: string | null;
  /** Canlılık kontrolünde çağrılan tam adres (GET). Boşsa kontrol yapılmaz. */
  healthUrl: string | null;
  /** Web uygulaması kökü; `/version.json` okunarak yayındaki sürüm gösterilir. */
  webUrl: string | null;
  firebaseProjectId: string | null;
  /** main = bu API'nin kendi kiracıları, remote = `tenantsUrl` üzerinden harici API, none = kiracı verisi yok. */
  tenantSource: TenantSource;
  /** Harici kiracı listesi (GET) — durum değişikliği `${tenantsUrl}/{id}/status` (POST). */
  tenantsUrl: string | null;
  enabled: boolean;
  notes: string | null;
  /** Varsayılan kayıtlar silinemez, yalnız sıfırlanır. */
  builtIn: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
  lastCheck?: BackendCheck | null;
  lastUpAt?: string | null;
  lastDownAt?: string | null;
}

export type BackendHealth = 'up' | 'degraded' | 'down' | 'unknown';

export interface WebCheck {
  status: BackendHealth;
  httpStatus: number | null;
  release: string | null;
  version: string | null;
  buildId: string | null;
  error: string | null;
}

export interface TenantSummary {
  total: number;
  active: number;
  suspended: number;
  closed: number;
  members: number;
}

export interface BackendCheck {
  status: BackendHealth;
  httpStatus: number | null;
  latencyMs: number | null;
  version: string | null;
  revision: string | null;
  error: string | null;
  checkedAt: string;
  web: WebCheck | null;
  tenants: TenantSummary | null;
  tenantsError: string | null;
}

export interface RemoteTenant {
  id: string;
  name: string;
  status: 'active' | 'suspended' | 'closed';
  modules: string[];
  ownerUid: string;
  ownerEmail: string | null;
  memberCount: number;
  companyCount: number;
  createdAt: string | null;
  statusChangedAt: string | null;
  statusReason: string | null;
}

export interface RemoteTenantList {
  items: RemoteTenant[];
  summary: TenantSummary;
  generatedAt: string;
}

type Seed = Omit<PlatformBackend, 'builtIn' | 'updatedAt' | 'updatedBy' | 'enabled' | 'notes'>;

export const DEFAULT_BACKENDS: Seed[] = [
  {
    id: 'main',
    name: 'Odivon Ana Platform',
    description: 'Sektörel ürünlerin ortak API\'si (bu yönetim paneli de buna bağlı).',
    products: [
      'Spor Salonu', 'Veteriner', 'Çiftlik', 'Spa', 'Kuaför', 'Güzellik', 'Randevu (APM)', 'Araç Kiralama',
      'Sürücü Kursu', 'Otopark', 'F-Gas', 'Makine CE', 'Gıda Etiketi', 'Ürün Güvenliği', 'Yangın Güvenliği',
      'Ücret Şeffaflığı', 'Kargo Belgeleri', 'Çocuk Ürünleri', 'Siber Hazırlık', 'Beslenme',
    ],
    apiUrl: 'https://mainapi.odivon.com/api/v1',
    healthUrl: null,
    webUrl: null,
    firebaseProjectId: 'odivon-main-api-a2095',
    tenantSource: 'main',
    tenantsUrl: null,
  },
  {
    id: 'erp',
    name: 'Odivon ERP',
    description: 'ERP paketi: Ön Muhasebe, Muhasebe, İK, Perakende/POS, MRP, Sipariş, Teklif, B2B, E-Dönüşüm.',
    products: [
      'Ön Muhasebe', 'Muhasebe', 'İK', 'Perakende', 'POS', 'MRP', 'Atölye', 'Sipariş', 'Teklif', 'B2B',
      'E-Dönüşüm',
    ],
    apiUrl: 'https://apierp.odivon.com',
    healthUrl: 'https://apierp.odivon.com/healthz',
    webUrl: 'https://erp.odivon.com',
    firebaseProjectId: 'odivonerp-38335',
    tenantSource: 'remote',
    tenantsUrl: 'https://apierp.odivon.com/internal/platform/tenants',
  },
  {
    id: 'school',
    name: 'Odivon School',
    description: 'API\'siz, doğrudan Firebase (Firestore + Functions) kullanan okul uygulaması.',
    products: ['Okul'],
    apiUrl: null,
    healthUrl: 'https://odivonschool.firebaseapp.com',
    webUrl: null,
    firebaseProjectId: 'odivonschool',
    tenantSource: 'none',
    tenantsUrl: null,
  },
  {
    id: 'faturapro',
    name: 'Odivon FaturaPro',
    description: 'API\'siz, doğrudan Firebase kullanan fatura uygulaması.',
    products: ['Fatura'],
    apiUrl: null,
    healthUrl: 'https://generateinvoiceweb.firebaseapp.com',
    webUrl: null,
    firebaseProjectId: 'generateinvoiceweb',
    tenantSource: 'none',
    tenantsUrl: null,
  },
];

export const BACKEND_ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,39}$/;
