import { sanitizePaymentDetail } from './payment-events.service';
import { PaymentModesService, resolveProductModes } from './payment-modes.service';

describe('payment monitoring', () => {
  it('follows PAYTR_MODE for products without their own mode', () => {
    const modes = resolveProductModes({ products: { gym: { mode: 'live', updatedAt: 't', updatedBy: 'a' } } }, 'sandbox');
    expect(modes.find((item) => item.product === 'gym')).toMatchObject({ mode: 'live', source: 'override' });
    expect(modes.find((item) => item.product === 'vet')).toMatchObject({ mode: 'sandbox', source: 'default' });
  });

  it('ignores an invalid stored mode', () => {
    const modes = resolveProductModes({ products: { gym: { mode: 'prod' as never, updatedAt: 't', updatedBy: 'a' } } }, 'live');
    expect(modes.find((item) => item.product === 'gym')).toMatchObject({ mode: 'live', source: 'default' });
  });

  it('sets and clears a product mode', async () => {
    const docs = new Map<string, unknown>();
    const firebase = { db: { doc: (path: string) => ({
      get: async () => ({ exists: docs.has(path), data: () => docs.get(path) }),
      set: async (data: unknown) => { docs.set(path, data); },
    }) } };
    const service = new PaymentModesService(firebase as never);
    const { before, after } = await service.set('gym', 'live', 'admin@odivon.com', 'sandbox', 'mağaza onaylandı');
    expect(before.mode).toBe('sandbox');
    expect(after).toMatchObject({ mode: 'live', source: 'override', updatedBy: 'admin@odivon.com' });
    await expect(service.modeFor('gym', 'sandbox')).resolves.toBe('live');
    await service.set('gym', null, 'admin@odivon.com', 'sandbox');
    await expect(service.modeFor('gym', 'sandbox')).resolves.toBe('sandbox');
  });

  it('falls back to the default mode when the setting cannot be read', async () => {
    const service = new PaymentModesService({ db: { doc: () => ({ get: async () => { throw new Error('down'); } }) } } as never);
    await expect(service.modeFor('gym', 'sandbox')).resolves.toBe('sandbox');
  });

  it('redacts signatures and keys from event details', () => {
    expect(sanitizePaymentDetail({ hash: 'abc', merchant_key: 'k', status: 'success', skip: undefined }))
      .toEqual({ hash: '[REDACTED]', merchant_key: '[REDACTED]', status: 'success' });
  });
});
