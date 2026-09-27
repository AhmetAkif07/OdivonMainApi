import assert from 'node:assert/strict';
import { CommissionRuleRecord, resolveCommissionAmount } from './commission-engine';

const base = {
  serviceId: 'svc-1',
  serviceType: 'masaj',
  staffId: 'staff-1',
  basisAmount: 1000,
  staffDefaultPercent: 10,
};
const rule = (r: Partial<CommissionRuleRecord>): CommissionRuleRecord => ({
  scope: 'staff',
  refId: 'staff-1',
  type: 'percent',
  value: 0,
  priority: 1,
  active: true,
  ...r,
});

test('falls back to the staff default percent when no rule matches', () => {
  assert.equal(
    resolveCommissionAmount({ ...base, rules: [rule({ refId: 'someone-else', value: 50 })] }),
    100,
  );
  assert.equal(resolveCommissionAmount({ ...base, rules: [], staffDefaultPercent: 0 }), 0);
});

test('service rule beats serviceType rule beats staff rule', () => {
  const rules = [
    rule({ scope: 'staff', value: 20 }),
    rule({ scope: 'serviceType', refId: 'masaj', value: 30 }),
    rule({ scope: 'service', refId: 'svc-1', value: 40 }),
  ];
  assert.equal(resolveCommissionAmount({ ...base, rules }), 400);
  assert.equal(resolveCommissionAmount({ ...base, rules: rules.slice(0, 2) }), 300);
  assert.equal(resolveCommissionAmount({ ...base, rules: rules.slice(0, 1) }), 200);
});

test('within one scope the lowest priority number wins', () => {
  const rules = [rule({ value: 25, priority: 5 }), rule({ value: 15, priority: 2 })];
  assert.equal(resolveCommissionAmount({ ...base, rules }), 150);
});

test('inactive rules are ignored', () => {
  const rules = [rule({ scope: 'service', refId: 'svc-1', value: 90, active: false })];
  assert.equal(resolveCommissionAmount({ ...base, rules }), 100);
});

test('fixed rules pay the flat amount regardless of the basis', () => {
  const rules = [rule({ type: 'fixed', value: 75.5 })];
  assert.equal(resolveCommissionAmount({ ...base, rules }), 75.5);
  assert.equal(resolveCommissionAmount({ ...base, basisAmount: 1, rules }), 75.5);
});

test('percent amounts are rounded to kuruş', () => {
  assert.equal(
    resolveCommissionAmount({ ...base, basisAmount: 333.33, staffDefaultPercent: 12.5, rules: [] }),
    41.67,
  );
});
