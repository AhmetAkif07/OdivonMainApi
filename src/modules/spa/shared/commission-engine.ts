import { round2 } from './spa-money';

export interface CommissionRuleRecord {
  scope: 'staff' | 'serviceType' | 'service';
  refId: string;
  type: 'percent' | 'fixed';
  value: number;
  priority: number;
  active: boolean;
}

/**
 * Commission owed to a staff member for one performed service: a service-specific rule beats a
 * serviceType rule beats a staff rule; among same-scope matches the lowest `priority` wins. Falls
 * back to the staff member's default percentage when no rule matches.
 */
export function resolveCommissionAmount(params: {
  serviceId: string;
  serviceType: string;
  staffId: string;
  basisAmount: number;
  rules: CommissionRuleRecord[];
  staffDefaultPercent: number;
}): number {
  const scopeRank: Record<CommissionRuleRecord['scope'], number> = {
    service: 0,
    serviceType: 1,
    staff: 2,
  };

  const candidates = params.rules.filter((rule) => {
    if (!rule.active) return false;
    if (rule.scope === 'service') return rule.refId === params.serviceId;
    if (rule.scope === 'serviceType') return rule.refId === params.serviceType;
    return rule.refId === params.staffId;
  });
  candidates.sort((a, b) => scopeRank[a.scope] - scopeRank[b.scope] || a.priority - b.priority);

  const winner = candidates[0];
  if (!winner) {
    return round2((params.staffDefaultPercent / 100) * params.basisAmount);
  }
  if (winner.type === 'fixed') {
    return round2(winner.value);
  }
  return round2((winner.value / 100) * params.basisAmount);
}
