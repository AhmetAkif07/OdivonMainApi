import { priceLine } from '../../finance/sale.totals';
import { DEFAULT_UTC_OFFSET_MINUTES, localDay } from '../../insights/day-end.logic';
import { CommissionReport, CommissionReportRow, CommissionRule, CommissionScope } from './commission.entity';

export interface CommissionSaleLine {
  productId: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  taxRatio: number;
  vatIncluded: boolean;
}

export interface CommissionSale {
  id: string;
  type: string;
  date: string;
  discount: number;
  lines: CommissionSaleLine[];
  appointmentId: string | null;
  createdBy: string;
}

export interface CommissionProduct {
  id: string;
  productType: string;
  categoryId: string | null;
}

export interface CommissionInput {
  from: string;
  to: string;
  sales: CommissionSale[];
  rules: CommissionRule[];
  products: Map<string, CommissionProduct>;
  /** appointmentId → doctor uid */
  appointmentDoctors: Map<string, string>;
  /** uid → name */
  staffNames: Map<string, string>;
  /** uid → role ids */
  staffRoles?: Map<string, string[]>;
}

/** Whether a rule is for this person: personal, for one of their roles, or for everyone. */
export function appliesTo(rule: CommissionRule, userId: string, roles: string[]): boolean {
  if (rule.userId) return rule.userId === userId;
  if (rule.roleId) return roles.includes(rule.roleId);
  return true;
}

export function validOn(rule: CommissionRule, day: string): boolean {
  return (!rule.validFrom || day >= rule.validFrom) && (!rule.validTo || day <= rule.validTo);
}

const SPECIFICITY: Record<CommissionScope, number> = { all: 0, productType: 1, category: 2, product: 3 };

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function covers(rule: CommissionRule, product: CommissionProduct | undefined, productId: string): boolean {
  switch (rule.scope) {
    case 'all':
      return true;
    case 'product':
      return rule.targetIds.includes(productId);
    case 'category':
      return Boolean(product?.categoryId && rule.targetIds.includes(product.categoryId));
    case 'productType':
      return Boolean(product && rule.targetIds.includes(product.productType));
  }
}

/** The rule used for a line: most specific scope first, then a person-specific rule over a general one. */
export function pickRule(
  rules: CommissionRule[],
  userId: string,
  productId: string,
  product: CommissionProduct | undefined,
  roles: string[] = [],
  day?: string,
): CommissionRule | null {
  let best: CommissionRule | null = null;
  let bestScore = -1;
  for (const rule of rules) {
    if (!rule.active || rule.kind !== 'commission') continue;
    if (!appliesTo(rule, userId, roles)) continue;
    if (day && !validOn(rule, day)) continue;
    if (!covers(rule, product, productId)) continue;
    // Scope first; then personal > role > everyone.
    const score = SPECIFICITY[rule.scope] * 3 + (rule.userId ? 2 : rule.roleId ? 1 : 0);
    if (score > bestScore) {
      best = rule;
      bestScore = score;
    }
  }
  return best;
}

/** Who a sale is credited to: the appointment's doctor, otherwise whoever recorded the sale. */
export function sellerOf(sale: CommissionSale, appointmentDoctors: Map<string, string>): string | null {
  return (sale.appointmentId && appointmentDoctors.get(sale.appointmentId)) || sale.createdBy || null;
}

export function buildCommissionReport(input: CommissionInput): CommissionReport {
  const rows = new Map<string, CommissionReportRow & { ruleMap: Map<string, CommissionReportRow['rules'][number]> }>();
  let unassignedSales = 0;

  const rowFor = (userId: string) => {
    let row = rows.get(userId);
    if (!row) {
      row = {
        userId,
        staffName: input.staffNames.get(userId) ?? 'Bilinmeyen kullanıcı',
        saleCount: 0,
        salesNet: 0,
        commission: 0,
        targetBonus: 0,
        total: 0,
        rules: [],
        ruleMap: new Map(),
      };
      rows.set(userId, row);
    }
    return row;
  };

  for (const sale of input.sales) {
    if (sale.type !== 'sale') continue;
    const day = localDay(sale.date, DEFAULT_UTC_OFFSET_MINUTES) ?? '';
    if (day < input.from || day > input.to) continue;
    const userId = sellerOf(sale, input.appointmentDoctors);
    if (!userId) {
      unassignedSales++;
      continue;
    }
    const priced = sale.lines.map((line) => ({ line, ...priceLine(line) }));
    const grossTotal = priced.reduce((sum, item) => sum + item.total, 0);
    // A document-level discount is shared across lines by their share of the total.
    const factor = grossTotal > 0 ? Math.max(0, grossTotal - (sale.discount || 0)) / grossTotal : 0;
    const row = rowFor(userId);
    row.saleCount++;
    for (const item of priced) {
      const base = item.net * factor;
      row.salesNet += base;
      const product = input.products.get(item.line.productId);
      const rule = pickRule(input.rules, userId, item.line.productId, product, input.staffRoles?.get(userId) ?? [], day);
      if (!rule) continue;
      const amount = rule.basis === 'percent' ? (base * rule.rate) / 100 : item.line.quantity * rule.rate;
      row.commission += amount;
      const entry = row.ruleMap.get(rule.id) ?? { ruleId: rule.id, ruleName: rule.name, kind: 'commission' as const, base: 0, amount: 0 };
      entry.base += base;
      entry.amount += amount;
      row.ruleMap.set(rule.id, entry);
    }
  }

  // Minimum totals: a commission rule pays nothing until the person's base for it reaches minTotal.
  const byId = new Map(input.rules.map((rule) => [rule.id, rule]));
  for (const row of rows.values()) {
    for (const entry of row.ruleMap.values()) {
      const min = byId.get(entry.ruleId)?.minTotal ?? 0;
      if (min > 0 && entry.base + 0.005 < min) {
        row.commission -= entry.amount;
        entry.amount = 0;
      }
    }
  }

  // Target bonuses: checked for everyone who sold something in the period.
  for (const row of rows.values()) {
    for (const rule of input.rules) {
      if (!rule.active || rule.kind !== 'target') continue;
      if (!appliesTo(rule, row.userId, input.staffRoles?.get(row.userId) ?? [])) continue;
      if (rule.validTo && rule.validTo < input.from) continue;
      if (rule.validFrom && rule.validFrom > input.to) continue;
      if (row.salesNet + 0.005 >= rule.threshold) {
        row.targetBonus += rule.amount;
        row.ruleMap.set(rule.id, { ruleId: rule.id, ruleName: rule.name, kind: 'target', base: row.salesNet, amount: rule.amount });
      }
    }
  }

  const list: CommissionReportRow[] = [...rows.values()]
    .map(({ ruleMap, ...row }) => ({
      ...row,
      salesNet: round2(row.salesNet),
      commission: round2(row.commission),
      targetBonus: round2(row.targetBonus),
      total: round2(row.commission + row.targetBonus),
      rules: [...ruleMap.values()].map((entry) => ({ ...entry, base: round2(entry.base), amount: round2(entry.amount) })),
    }))
    .sort((a, b) => b.total - a.total || b.salesNet - a.salesNet);

  const sum = (key: 'salesNet' | 'commission' | 'targetBonus' | 'total') => round2(list.reduce((acc, row) => acc + row[key], 0));
  return {
    from: input.from,
    to: input.to,
    rows: list,
    totals: { salesNet: sum('salesNet'), commission: sum('commission'), targetBonus: sum('targetBonus'), total: sum('total') },
    unassignedSales,
  };
}
