import { PRODUCT_MODULES, ProductModule } from '../../../shared/authorization/constants';
import { SupportTicket, TicketGroup, TicketStatus } from './tickets.entity';

/** Product names as the management panel shows them. */
export const PRODUCT_LABELS: Record<ProductModule, string> = {
  vet: 'Veteriner',
  farm: 'Çiftlik',
  gym: 'Spor Salonu',
  spa: 'Spa',
  hair: 'Kuaför',
  beauty: 'Güzellik Merkezi',
  apm: 'Randevu Yönetimi',
  rentacar: 'Rent A Car',
  drivingschool: 'Sürücü Kursu',
  parking: 'Otopark',
  fgas: 'F-Gas',
  'machine-ce': 'Makine CE',
  'food-label': 'Gıda Etiketi',
  'product-safe': 'Ürün Güvenliği',
  'fire-safe': 'Yangın Güvenliği',
  'pay-fair': 'Ücret Şeffaflığı',
  'cargo-docs': 'Kargo Belgeleri',
  kids: 'Çocuk Ürünleri',
  'cyber-ready': 'Siber Hazırlık',
  diet: 'Beslenme',
};

/** Group key for tickets with no product / no tenant. */
export const UNKNOWN_GROUP = 'unknown';

export function isProductModule(value: unknown): value is ProductModule {
  return typeof value === 'string' && (PRODUCT_MODULES as readonly string[]).includes(value);
}

/**
 * Picks the product of a ticket: an explicit one wins, otherwise the single product of the
 * user or the tenant. A multi-product tenant with no explicit product stays unknown.
 */
export function resolveTicketProduct(
  explicit: unknown,
  ...candidates: (readonly string[] | null | undefined)[]
): ProductModule | null {
  if (isProductModule(explicit)) return explicit;
  for (const list of candidates) {
    const valid = (list ?? []).filter(isProductModule);
    if (valid.length === 1) return valid[0];
  }
  return null;
}

function emptyCounts(): Record<TicketStatus, number> {
  return { pending: 0, in_progress: 0, approved: 0, completed: 0, rejected: 0 };
}

const OPEN_STATUSES: TicketStatus[] = ['pending', 'in_progress', 'approved'];

function groupBy(
  tickets: SupportTicket[],
  keyOf: (t: SupportTicket) => string,
  labelOf: (t: SupportTicket, key: string) => string,
  productOf?: (t: SupportTicket) => ProductModule | null,
): TicketGroup[] {
  const groups = new Map<string, TicketGroup>();
  for (const t of tickets) {
    const key = keyOf(t);
    let g = groups.get(key);
    if (!g) {
      g = { key, label: labelOf(t, key), total: 0, open: 0, counts: emptyCounts() };
      if (productOf) g.product = productOf(t);
      groups.set(key, g);
    }
    g.total += 1;
    if (t.status in g.counts) g.counts[t.status] += 1;
    if (OPEN_STATUSES.includes(t.status)) g.open += 1;
  }
  // Most open tickets first, unknown group last.
  return [...groups.values()].sort((a, b) => {
    if (a.key === UNKNOWN_GROUP) return 1;
    if (b.key === UNKNOWN_GROUP) return -1;
    return b.open - a.open || b.total - a.total || a.label.localeCompare(b.label, 'tr');
  });
}

export function groupTicketsByProduct(tickets: SupportTicket[]): TicketGroup[] {
  return groupBy(
    tickets,
    (t) => t.product || UNKNOWN_GROUP,
    (t, key) => (key === UNKNOWN_GROUP ? 'Ürün belirtilmemiş' : t.productLabel || PRODUCT_LABELS[key as ProductModule] || key),
  );
}

export function groupTicketsByTenant(tickets: SupportTicket[]): TicketGroup[] {
  return groupBy(
    tickets,
    (t) => t.tenantId || UNKNOWN_GROUP,
    (t, key) => (key === UNKNOWN_GROUP ? 'Tenant bağlı değil' : t.tenantName || key),
    (t) => t.product ?? null,
  );
}
