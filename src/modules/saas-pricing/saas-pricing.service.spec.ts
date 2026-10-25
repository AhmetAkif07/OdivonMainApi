import { SaasPricingService, SAAS_PRICING_DOC, mergeSaasPricing } from './saas-pricing.service';

describe('SaasPricingService', () => {
  let stored: Record<string, unknown> | undefined;
  const firebase = {
    db: {
      doc: (path: string) => {
        expect(path).toBe(SAAS_PRICING_DOC);
        return {
          get: async () => ({ exists: stored !== undefined, data: () => stored }),
          set: async (data: { plans: Record<string, unknown>; updatedAt: string }) => {
            const current = (stored ?? {}) as { plans?: Record<string, unknown> };
            stored = { ...current, updatedAt: data.updatedAt, plans: { ...(current.plans ?? {}), ...data.plans } };
          },
        };
      },
    },
  };
  let service: SaasPricingService;

  beforeEach(() => {
    stored = undefined;
    service = new SaasPricingService(firebase as never);
  });

  it('uses the code defaults until the panel saves an override', async () => {
    expect(await service.price('apm_premium', 'monthly')).toBe(59.99);
    expect(await service.price('apm_premium', 'yearly')).toBeUndefined();
    const catalog = mergeSaasPricing(undefined);
    expect(catalog.plans.map((plan) => plan.id)).toEqual(expect.arrayContaining(['starter', 'pro', 'enterprise', 'apm_limited', 'rent_starter']));
    expect(catalog.plans.every((plan) => !plan.customized)).toBe(true);
  });

  it('applies a saved price at once and stops selling deactivated plans', async () => {
    await service.update('pro', { monthly: 2990.5, yearly: 29900 }, 'admin@odivon.com');
    expect(await service.price('pro', 'monthly')).toBe(2990.5);
    expect(await service.price('pro', 'yearly')).toBe(29900);

    await service.update('pro', { active: false }, 'admin@odivon.com');
    expect(await service.price('pro', 'monthly')).toBeUndefined();
    expect(Object.keys(await service.priceMap())).not.toContain('pro');
    expect((await service.activePlans('shared')).map((plan) => plan.id)).toEqual(['starter', 'enterprise']);
  });

  it('can stop selling one billing cycle with null', async () => {
    await service.update('starter', { yearly: null }, 'a');
    expect((await service.priceMap()).starter).toEqual({ monthly: 1 });
  });

  it('rejects unknown plans and an active plan without any price', async () => {
    await expect(service.update('gold', { monthly: 10 }, 'a')).rejects.toThrow('Bilinmeyen plan');
    await expect(service.update('apm_limited', { monthly: null }, 'a')).rejects.toThrow('en az bir fiyat');
    await expect(service.update('apm_limited', { monthly: 0 }, 'a')).rejects.toThrow('Geçersiz');
  });
});
