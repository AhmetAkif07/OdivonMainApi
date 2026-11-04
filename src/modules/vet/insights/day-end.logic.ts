/**
 * End-of-day analysis: pure functions that turn the day's records into metrics and findings.
 * The service only loads data; everything here is testable without Firestore.
 */

export const DEFAULT_UTC_OFFSET_MINUTES = 180;

export type FindingSeverity = 'critical' | 'warning' | 'info' | 'positive';

export interface DayEndFinding {
  code: string;
  severity: FindingSeverity;
  title: string;
  detail: string;
  /** Client route that helps act on the finding. */
  link: string | null;
}

export interface DayEndMetrics {
  salesTotal: number;
  saleCount: number;
  cashSales: number;
  creditSales: number;
  collectionsTotal: number;
  paymentsTotal: number;
  appointments: number;
  completedAppointments: number;
  noShows: number;
  cancelledAppointments: number;
  /** Appointments of the day still marked scheduled. */
  unresolvedAppointments: number;
  newCustomers: number;
  openTillSessions: number;
  tillDifferences: number;
  lowStockItems: number;
  negativeStockItems: number;
  chequesOverdue: number;
  chequesOverdueAmount: number;
  chequesDueToday: number;
  chequesDueTodayAmount: number;
  chequesDueNext7Days: number;
  receivablesTotal: number;
  customersWithBalance: number;
}

export interface DayEndComparison {
  avg7Sales: number;
  avg7Collections: number;
  avg7Appointments: number;
  /** % change of today's sales vs the 7-day average; null when there is no average. */
  salesChangePct: number | null;
}

export interface DayEndReport {
  date: string;
  metrics: DayEndMetrics;
  comparison: DayEndComparison;
  findings: DayEndFinding[];
  /** Short Turkish summary built from the findings. */
  summary: string;
  generatedAt: string;
}

// ── Input shapes (only the fields used) ───────────────────

export interface SaleInput {
  type: string;
  date: string;
  total: number;
  customerId: string | null;
  paymentMethodId: string | null;
}
export interface CollectionInput {
  kind: string;
  date: string;
  amount: number;
  customerId: string | null;
}
export interface AppointmentInput {
  beginAt: string;
  status: string;
}
export interface CustomerInput {
  id: string;
  firstName?: string;
  lastName?: string;
  createdAt: string;
}
export interface CashSessionInput {
  status: string;
  openedAt: string;
  closedAt: string | null;
  difference: number | null;
  cashRegisterId: string;
}
export interface StockBalanceInput {
  productName: string;
  storeName: string;
  onHand: number;
  low: boolean;
}
export interface ChequeInput {
  direction: string;
  status: string;
  dueDate: string;
  amount: number;
}

export interface DayEndInput {
  date: string;
  utcOffsetMinutes: number;
  now: Date;
  sales: SaleInput[];
  collections: CollectionInput[];
  appointments: AppointmentInput[];
  customers: CustomerInput[];
  cashSessions: CashSessionInput[];
  stock: StockBalanceInput[];
  cheques: ChequeInput[];
  /** Ids of open-account (veresiye) payment methods. */
  creditMethods: Set<string>;
  /** Names for customers mentioned in findings (others show as "Müşteri"). */
  customerNames?: Map<string, string>;
}

/**
 * Open balance per customer: open-account sales minus the customer's collections, up to and
 * including `date`. Only positive balances, largest first.
 */
export function receivableBalances(
  input: Pick<DayEndInput, 'sales' | 'collections' | 'creditMethods' | 'date' | 'utcOffsetMinutes'>,
): Array<[string, number]> {
  const dayOf = (value: string | null | undefined) => localDay(value, input.utcOffsetMinutes) ?? '';
  const balances = new Map<string, number>();
  for (const sale of input.sales) {
    if (sale.type !== 'sale' || !sale.customerId || !sale.paymentMethodId || !input.creditMethods.has(sale.paymentMethodId)) continue;
    if (dayOf(sale.date) > input.date) continue;
    balances.set(sale.customerId, (balances.get(sale.customerId) ?? 0) + (Number(sale.total) || 0));
  }
  for (const item of input.collections) {
    if (item.kind !== 'collection' || !item.customerId || !balances.has(item.customerId)) continue;
    if (dayOf(item.date) > input.date) continue;
    balances.set(item.customerId, balances.get(item.customerId)! - (Number(item.amount) || 0));
  }
  return [...balances.entries()].filter(([, value]) => value > 0.009).sort((a, b) => b[1] - a[1]);
}

const OPEN_CHEQUE_STATUSES = new Set(['portfolio', 'deposited', 'issued', 'bounced']);

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function formatTry(value: number): string {
  return `${new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(Math.round(value))} ₺`;
}

/** Local calendar day (YYYY-MM-DD) of a stored date; date-only strings are taken as they are. */
export function localDay(value: string | null | undefined, utcOffsetMinutes: number): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return null;
  return new Date(time + utcOffsetMinutes * 60_000).toISOString().slice(0, 10);
}

export function addDaysToDate(date: string, days: number): string {
  const base = new Date(`${date}T00:00:00.000Z`).getTime();
  return new Date(base + days * 86_400_000).toISOString().slice(0, 10);
}

/** UTC instant where the local day `date` ends. */
export function dayEndInstant(date: string, utcOffsetMinutes: number): Date {
  return new Date(new Date(`${date}T23:59:59.999Z`).getTime() - utcOffsetMinutes * 60_000);
}

export function buildDayEnd(input: DayEndInput): DayEndReport {
  const { date, utcOffsetMinutes: tz } = input;
  const dayOf = (value: string | null | undefined) => localDay(value, tz);
  const previousDays = new Set(Array.from({ length: 7 }, (_, i) => addDaysToDate(date, -(i + 1))));
  const isCredit = (id: string | null) => Boolean(id && input.creditMethods.has(id));

  const sales = input.sales.filter((sale) => sale.type === 'sale');
  const todaySales = sales.filter((sale) => dayOf(sale.date) === date);
  const salesTotal = round2(todaySales.reduce((sum, sale) => sum + (Number(sale.total) || 0), 0));
  const creditSales = round2(
    todaySales.filter((sale) => isCredit(sale.paymentMethodId)).reduce((sum, sale) => sum + (Number(sale.total) || 0), 0),
  );

  const todayCollections = input.collections.filter((item) => dayOf(item.date) === date);
  const collectionsTotal = round2(
    todayCollections.filter((item) => item.kind === 'collection').reduce((sum, item) => sum + (Number(item.amount) || 0), 0),
  );
  const paymentsTotal = round2(
    todayCollections.filter((item) => item.kind === 'payment').reduce((sum, item) => sum + (Number(item.amount) || 0), 0),
  );

  const todayAppointments = input.appointments.filter((item) => dayOf(item.beginAt) === date);
  const dayIsOver = input.now.getTime() > dayEndInstant(date, tz).getTime();
  const unresolved = todayAppointments.filter(
    (item) => item.status === 'scheduled' && (dayIsOver || new Date(item.beginAt).getTime() < input.now.getTime()),
  ).length;

  const sum7 = (values: number[]) => values.reduce((a, b) => a + b, 0) / 7;
  const avg7Sales = round2(
    sum7(sales.filter((sale) => previousDays.has(dayOf(sale.date) ?? '')).map((sale) => Number(sale.total) || 0)),
  );
  const avg7Collections = round2(
    sum7(
      input.collections
        .filter((item) => item.kind === 'collection' && previousDays.has(dayOf(item.date) ?? ''))
        .map((item) => Number(item.amount) || 0),
    ),
  );
  const avg7Appointments = round2(
    input.appointments.filter((item) => previousDays.has(dayOf(item.beginAt) ?? '') && item.status !== 'cancelled').length / 7,
  );
  const salesChangePct = avg7Sales > 0 ? Math.round(((salesTotal - avg7Sales) / avg7Sales) * 100) : null;

  const dayEnd = dayEndInstant(date, tz).toISOString();
  const openSessions = input.cashSessions.filter((item) => item.status === 'open' && item.openedAt <= dayEnd);
  const closedToday = input.cashSessions.filter((item) => item.status === 'closed' && dayOf(item.closedAt) === date);
  const differences = closedToday.filter((item) => Math.abs(Number(item.difference) || 0) >= 0.01);

  const negative = input.stock.filter((item) => item.onHand < 0);
  const low = input.stock.filter((item) => item.low && item.onHand >= 0);

  const openCheques = input.cheques.filter((item) => OPEN_CHEQUE_STATUSES.has(item.status));
  const overdue = openCheques.filter((item) => (item.dueDate ?? '').slice(0, 10) < date);
  const dueToday = openCheques.filter((item) => (item.dueDate ?? '').slice(0, 10) === date);
  const next7End = addDaysToDate(date, 7);
  const dueSoon = openCheques.filter((item) => {
    const due = (item.dueDate ?? '').slice(0, 10);
    return due > date && due <= next7End;
  });
  const amount = (items: ChequeInput[]) => round2(items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0));

  const positive = receivableBalances(input);
  const receivablesTotal = round2(positive.reduce((sum, [, value]) => sum + value, 0));
  const customerNames = input.customerNames ?? new Map<string, string>();

  const newCustomers = input.customers.filter((item) => dayOf(item.createdAt) === date).length;

  const metrics: DayEndMetrics = {
    salesTotal,
    saleCount: todaySales.length,
    cashSales: round2(salesTotal - creditSales),
    creditSales,
    collectionsTotal,
    paymentsTotal,
    appointments: todayAppointments.length,
    completedAppointments: todayAppointments.filter((item) => item.status === 'completed').length,
    noShows: todayAppointments.filter((item) => item.status === 'no_show').length,
    cancelledAppointments: todayAppointments.filter((item) => item.status === 'cancelled').length,
    unresolvedAppointments: unresolved,
    newCustomers,
    openTillSessions: openSessions.length,
    tillDifferences: differences.length,
    lowStockItems: low.length,
    negativeStockItems: negative.length,
    chequesOverdue: overdue.length,
    chequesOverdueAmount: amount(overdue),
    chequesDueToday: dueToday.length,
    chequesDueTodayAmount: amount(dueToday),
    chequesDueNext7Days: dueSoon.length,
    receivablesTotal,
    customersWithBalance: positive.length,
  };

  const findings: DayEndFinding[] = [];
  const add = (code: string, severity: FindingSeverity, title: string, detail: string, link: string | null = null) =>
    findings.push({ code, severity, title, detail, link });
  const names = (items: StockBalanceInput[]) =>
    items
      .slice(0, 5)
      .map((item) => `${item.productName} (${item.onHand})`)
      .join(', ') + (items.length > 5 ? ` ve ${items.length - 5} ürün daha` : '');

  if (negative.length) {
    add('stock.negative', 'critical', `${negative.length} üründe stok eksiye düşmüş`, `${names(negative)}. Sayım veya alış kaydı eksik olabilir.`, '/stock');
  }
  if (overdue.length) {
    add(
      'cheques.overdue',
      'critical',
      `${overdue.length} çek/senet vadesi geçmiş (${formatTry(metrics.chequesOverdueAmount)})`,
      'Tahsil edilmemiş veya ödenmemiş kayıtları kontrol edin.',
      '/finance/cheques',
    );
  }
  if (openSessions.length) {
    const stale = openSessions.filter((item) => (dayOf(item.openedAt) ?? date) < date).length;
    add(
      'till.open',
      stale ? 'critical' : 'warning',
      `${openSessions.length} kasa kapatılmamış`,
      stale ? `${stale} kasa önceki günlerden beri açık. Z raporu için kasayı kapatın.` : 'Gün sonunda kasayı sayıp kapatmayı unutmayın.',
      '/finance/till',
    );
  }
  if (differences.length) {
    const total = round2(differences.reduce((sum, item) => sum + (Number(item.difference) || 0), 0));
    add(
      'till.difference',
      Math.abs(total) >= 100 ? 'critical' : 'warning',
      `Kasa kapanışında ${formatTry(Math.abs(total))} ${total < 0 ? 'eksik' : 'fazla'}`,
      `${differences.length} kasa kapanışında sayılan tutar beklenenden farklı.`,
      '/finance/till',
    );
  }
  if (dueToday.length) {
    add('cheques.dueToday', 'warning', `Bugün vadesi gelen ${dueToday.length} çek/senet (${formatTry(metrics.chequesDueTodayAmount)})`, 'Tahsilat veya ödemeyi kaydedin.', '/finance/cheques');
  }
  if (unresolved) {
    add('appointments.unresolved', 'warning', `${unresolved} randevunun durumu güncellenmemiş`, 'Gelen hastaları "tamamlandı", gelmeyenleri "gelmedi" olarak işaretleyin.', '/appointments');
  }
  if (todayAppointments.length >= 3 && metrics.noShows / todayAppointments.length >= 0.2) {
    add('appointments.noShow', 'warning', `Gelmeyen oranı yüksek: ${metrics.noShows}/${todayAppointments.length}`, 'Randevu hatırlatma mesajı göndermeyi düşünün.', '/appointments');
  } else if (metrics.noShows) {
    add('appointments.noShow', 'info', `${metrics.noShows} hasta randevusuna gelmedi`, 'Sahipleriyle iletişime geçip yeni randevu verebilirsiniz.', '/appointments');
  }
  if (salesChangePct !== null && salesChangePct <= -40) {
    add('sales.belowAverage', 'warning', `Ciro 7 günlük ortalamanın %${Math.abs(salesChangePct)} altında`, `Bugün ${formatTry(salesTotal)}, ortalama ${formatTry(avg7Sales)}.`, '/finance/sales');
  } else if (salesChangePct !== null && salesChangePct >= 30) {
    add('sales.aboveAverage', 'positive', `Ciro 7 günlük ortalamanın %${salesChangePct} üstünde`, `Bugün ${formatTry(salesTotal)}, ortalama ${formatTry(avg7Sales)}.`, '/finance/sales');
  }
  if (salesTotal > 0 && creditSales / salesTotal >= 0.4) {
    add('sales.credit', 'warning', `Satışların %${Math.round((creditSales / salesTotal) * 100)}'i veresiye`, `${formatTry(creditSales)} açık hesaba yazıldı; tahsilat takibi yapın.`, '/finance/sales');
  }
  if (low.length) {
    add('stock.low', 'warning', `${low.length} ürün kritik stok seviyesinde`, `${names(low)}.`, '/stock');
  }
  if (positive.length) {
    const top = positive
      .slice(0, 3)
      .map(([id, value]) => `${customerNames.get(id) || 'Müşteri'} (${formatTry(value)})`)
      .join(', ');
    add('receivables', 'info', `${positive.length} müşteride ${formatTry(receivablesTotal)} açık bakiye`, `En yüksek: ${top}.`, '/customers');
  }
  if (dueSoon.length) {
    add('cheques.dueSoon', 'info', `Önümüzdeki 7 günde ${dueSoon.length} çek/senet vadesi`, `Toplam ${formatTry(amount(dueSoon))}.`, '/finance/cheques');
  }
  if (newCustomers) {
    add('customers.new', 'positive', `${newCustomers} yeni müşteri kaydı`, 'İlk ziyaret sonrası memnuniyet anketi göndermeyi unutmayın.', '/customers');
  }
  if (!todaySales.length && !todayAppointments.length) {
    add('day.quiet', 'info', 'Bugün satış ve randevu kaydı yok', 'Kayıtlar girilmediyse gün sonu raporu eksik kalır.', null);
  }

  const order: Record<FindingSeverity, number> = { critical: 0, warning: 1, info: 2, positive: 3 };
  findings.sort((a, b) => order[a.severity] - order[b.severity]);

  return {
    date,
    metrics,
    comparison: { avg7Sales, avg7Collections, avg7Appointments, salesChangePct },
    findings,
    summary: summaryText(metrics, salesChangePct, findings),
    generatedAt: input.now.toISOString(),
  };
}

function summaryText(metrics: DayEndMetrics, change: number | null, findings: DayEndFinding[]): string {
  const parts: string[] = [];
  const changeText = change === null ? '' : change >= 0 ? ` (ortalamanın %${change} üstü)` : ` (ortalamanın %${Math.abs(change)} altı)`;
  parts.push(`Bugün ${metrics.saleCount} satışla ${formatTry(metrics.salesTotal)} ciro yapıldı${changeText}, ${formatTry(metrics.collectionsTotal)} tahsil edildi.`);
  if (metrics.appointments) {
    parts.push(`${metrics.appointments} randevunun ${metrics.completedAppointments} tanesi tamamlandı${metrics.noShows ? `, ${metrics.noShows} hasta gelmedi` : ''}.`);
  }
  const critical = findings.filter((f) => f.severity === 'critical').length;
  const warning = findings.filter((f) => f.severity === 'warning').length;
  if (critical || warning) {
    parts.push(`${critical ? `${critical} acil` : ''}${critical && warning ? ' ve ' : ''}${warning ? `${warning} dikkat` : ''} gerektiren konu var.`);
  } else {
    parts.push('Dikkat gerektiren bir konu yok.');
  }
  return parts.join(' ');
}
