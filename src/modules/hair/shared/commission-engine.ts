import { round2 } from './hair-money';

export type CommissionScope = 'staff' | 'serviceCategory' | 'service';

export interface CommissionRuleRecord {
  id?: string;
  scope: CommissionScope;
  refId: string;
  type: 'percent' | 'fixed';
  value: number;
  priority: number;
  active: boolean;
}

export interface CommissionResult {
  amount: number;
  /** Matching rule; undefined when the staff default percentage was used (C-005). */
  ruleId?: string;
}

const SCOPE_RANK: Record<CommissionScope, number> = { service: 0, serviceCategory: 1, staff: 2 };

/**
 * Commission for one performed service line (plan §8.3): service rule > serviceCategory rule >
 * staff rule (C-001); among same-scope matches the lowest `priority` wins (C-002). `percent` is taken
 * of `basisAmount` — the undiscounted price × quantity (C-006) — and `fixed` is a flat amount per line
 * (C-004). Without a matching rule the staff member's default percentage applies (C-005).
 */
export function resolveCommission(params: {
  serviceId: string;
  categoryId?: string | null;
  staffId: string;
  basisAmount: number;
  rules: CommissionRuleRecord[];
  staffDefaultPercent: number;
}): CommissionResult {
  const candidates = params.rules.filter((rule) => {
    if (!rule.active) return false;
    if (rule.scope === 'service') return rule.refId === params.serviceId;
    if (rule.scope === 'serviceCategory') return !!params.categoryId && rule.refId === params.categoryId;
    return rule.refId === params.staffId;
  });
  candidates.sort(
    (a, b) => SCOPE_RANK[a.scope] - SCOPE_RANK[b.scope] || a.priority - b.priority,
  );

  const winner = candidates[0];
  if (!winner) {
    return { amount: round2((Math.max(0, params.staffDefaultPercent) / 100) * params.basisAmount) };
  }
  const amount =
    winner.type === 'fixed' ? round2(winner.value) : round2((winner.value / 100) * params.basisAmount);
  return { amount, ruleId: winner.id };
}
