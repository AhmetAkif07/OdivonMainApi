import { CommissionRuleRecord, resolveCommission } from './commission-engine';

const rule = (overrides: Partial<CommissionRuleRecord>): CommissionRuleRecord => ({
  id: 'r',
  scope: 'staff',
  refId: 'st1',
  type: 'percent',
  value: 10,
  priority: 100,
  active: true,
  ...overrides,
});

const base = { serviceId: 'svc1', categoryId: 'cat1', staffId: 'st1', basisAmount: 500, staffDefaultPercent: 30 };

describe('resolveCommission (plan §8.3)', () => {
  it('service-specific rule beats category and staff rules (C-001)', () => {
    const result = resolveCommission({
      ...base,
      rules: [
        rule({ id: 'staff', scope: 'staff', refId: 'st1', value: 5 }),
        rule({ id: 'cat', scope: 'serviceCategory', refId: 'cat1', value: 15 }),
        rule({ id: 'svc', scope: 'service', refId: 'svc1', value: 20 }),
      ],
    });
    expect(result).toEqual({ amount: 100, ruleId: 'svc' });
  });

  it('category rule wins when there is no service rule', () => {
    const result = resolveCommission({
      ...base,
      rules: [
        rule({ id: 'staff', scope: 'staff', refId: 'st1', value: 5 }),
        rule({ id: 'cat', scope: 'serviceCategory', refId: 'cat1', value: 15 }),
        rule({ id: 'other-svc', scope: 'service', refId: 'svc2', value: 50 }),
      ],
    });
    expect(result).toEqual({ amount: 75, ruleId: 'cat' });
  });

  it('lowest priority wins inside the same scope (C-002)', () => {
    const result = resolveCommission({
      ...base,
      rules: [
        rule({ id: 'late', scope: 'service', refId: 'svc1', value: 40, priority: 10 }),
        rule({ id: 'early', scope: 'service', refId: 'svc1', value: 12, priority: 1 }),
      ],
    });
    expect(result.ruleId).toBe('early');
    expect(result.amount).toBe(60);
  });

  it('pays a fixed amount per line (C-004)', () => {
    const result = resolveCommission({
      ...base,
      rules: [rule({ id: 'fixed', scope: 'service', refId: 'svc1', type: 'fixed', value: 42.5 })],
    });
    expect(result).toEqual({ amount: 42.5, ruleId: 'fixed' });
  });

  it('falls back to the staff default percentage (C-005)', () => {
    expect(resolveCommission({ ...base, rules: [] })).toEqual({ amount: 150 });
  });

  it('skips inactive rules and rules of other staff / categories', () => {
    const result = resolveCommission({
      ...base,
      rules: [
        rule({ scope: 'service', refId: 'svc1', value: 90, active: false }),
        rule({ scope: 'staff', refId: 'someone-else', value: 90 }),
        rule({ scope: 'serviceCategory', refId: 'cat2', value: 90 }),
      ],
    });
    expect(result).toEqual({ amount: 150 });
  });

  it('ignores category rules when the service has no category', () => {
    const result = resolveCommission({
      ...base,
      categoryId: null,
      rules: [rule({ scope: 'serviceCategory', refId: 'cat1', value: 90 })],
    });
    expect(result.amount).toBe(150);
  });

  it('rounds to kuruş', () => {
    const result = resolveCommission({ ...base, basisAmount: 333.33, rules: [], staffDefaultPercent: 33 });
    expect(result.amount).toBe(110);
  });
});
