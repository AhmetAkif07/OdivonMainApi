import {
  SaasPricingService,
  SAAS_PRICING_DOC,
  mergeSaasPricing,
  pricingProduct,
} from './saas-pricing.service';

describe('SaasPricingService', () => {
  let stored: Record<string, any> | undefined;
  const firebase = {
    db: {
      doc: (path: string) => {
        expect(path).toBe(SAAS_PRICING_DOC);
        return {
          get: async () => ({ exists: stored !== undefined, data: () => stored }),
          set: async (
            data: Record<string, any>,
            options: { merge?: boolean; mergeFields?: string[] },
          ) => {
            const current = stored ?? {};
            if (options.mergeFields) {
              stored = { ...current };
              for (const field of options.mergeFields) stored[field] = data[field];
            } else {
              stored = {
                ...current,
                ...data,
                plans: { ...(current.plans ?? {}), ...(data.plans ?? {}) },
              };
            }
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
    expect(await service.price('apm_premium', 'monthly', 'apm')).toBe(59.99);
    expect(await service.price('apm_premium', 'yearly', 'apm')).toBeUndefined();
    const catalog = mergeSaasPricing(undefined);
    expect(catalog.plans.map((plan) => plan.id)).toEqual(
      expect.arrayContaining(['starter', 'pro', 'enterprise', 'apm_limited', 'rent_starter']),
    );
    expect(catalog.plans.every((plan) => plan.source === 'code')).toBe(true);
  });

  it('lists only the plans a product sells', () => {
    expect(mergeSaasPricing(undefined, 'apm').plans.map((plan) => plan.id)).toEqual([
      'apm_limited',
      'apm_premium',
    ]);
    expect(mergeSaasPricing(undefined, 'gym').plans.map((plan) => plan.id)).toEqual([
      'starter',
      'pro',
      'enterprise',
    ]);
    expect(mergeSaasPricing(undefined, 'rentacar').plans.map((plan) => plan.id)).toContain(
      'rent_business',
    );
  });

  it('gives each product its own price and falls back to the default', async () => {
    await service.update('pro', { monthly: 2990, yearly: 29900 }, 'admin');
    await service.update('pro', { monthly: 1990, yearly: 19900 }, 'admin', 'vet');
    expect(await service.price('pro', 'monthly', 'vet')).toBe(1990);
    expect(await service.price('pro', 'monthly', 'gym')).toBe(2990);
    expect((await service.catalog('vet')).plans.find((plan) => plan.id === 'pro')!.source).toBe(
      'product',
    );

    await service.update('enterprise', { active: false }, 'admin', 'kids');
    expect(await service.price('enterprise', 'monthly', 'kids')).toBeUndefined();
    expect(await service.price('enterprise', 'monthly', 'gym')).toBe(5990);

    await service.resetProductPrice('pro', 'vet');
    expect(await service.price('pro', 'monthly', 'vet')).toBe(2990);
    expect(await service.price('enterprise', 'monthly', 'kids')).toBeUndefined();
  });

  it('can stop selling one billing cycle with null', async () => {
    await service.update('starter', { yearly: null }, 'a');
    expect((await service.priceMap('gym')).starter).toEqual({ monthly: 1490 });
  });

  it('rejects unknown plans/products, foreign packages and an active plan without any price', async () => {
    await expect(service.update('gold', { monthly: 10 }, 'a')).rejects.toThrow('Bilinmeyen plan');
    await expect(service.update('pro', { monthly: 10 }, 'a', 'nope' as never)).rejects.toThrow(
      'Bilinmeyen ürün',
    );
    await expect(service.update('apm_limited', { monthly: 10 }, 'a', 'gym')).rejects.toThrow(
      'bu üründe satılmıyor',
    );
    await expect(service.update('pro', { monthly: 10 }, 'a', 'apm')).rejects.toThrow(
      'bu üründe satılmıyor',
    );
    await expect(service.update('apm_limited', { monthly: null }, 'a')).rejects.toThrow(
      'en az bir fiyat',
    );
    await expect(service.update('apm_limited', { monthly: 0 }, 'a')).rejects.toThrow('Geçersiz');
  });

  it('prices a tenant as its product', () => {
    expect(pricingProduct(['vet'])).toBe('vet');
    expect(pricingProduct(['apm', 'gym'])).toBe('gym');
    expect(pricingProduct(['gym'], 'apm_limited')).toBe('apm');
    expect(pricingProduct([])).toBeNull();
  });
});
