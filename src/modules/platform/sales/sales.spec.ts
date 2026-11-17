import { FakeFirestore } from '../../../shared/testing/fake-firestore';
import { isTrMobile, leadEmail, leadMobile, leadProducts, normalizeTrPhone } from '../ai-research/lead-fields';
import { formatPrice, manualLink, renderSalesText } from './sales-templates';
import { PlatformSalesService } from './sales.service';
import { SalesConsentService } from './sales-consent.service';

const admin = { uid: 'admin1', email: 'admin@odivon.com' } as never;

describe('lead fields', () => {
  it('normalises Turkish phone numbers to E.164', () => {
    expect(normalizeTrPhone('0532 123 45 67')).toBe('+905321234567');
    expect(normalizeTrPhone('+90 (532) 123-4567')).toBe('+905321234567');
    expect(normalizeTrPhone('5321234567')).toBe('+905321234567');
    expect(normalizeTrPhone('0242 321 00 00')).toBe('+902423210000');
    expect(normalizeTrPhone('123')).toBeNull();
    expect(isTrMobile('+902423210000')).toBe(false);
    expect(isTrMobile('+905321234567')).toBe(true);
  });

  it('prefers the panel-entered WhatsApp number and skips landlines', () => {
    expect(leadMobile({ phone: '0242 321 00 00' })).toBeNull();
    expect(leadMobile({ phone: '0242 321 00 00', pipeline: { contact: { whatsapp: '0555 111 22 33' } } })).toBe('+905551112233');
  });

  it('uses assigned products, otherwise infers gym from the classification', () => {
    expect(leadProducts({ insight: { isGym: true } })).toEqual({ products: ['gym'], inferred: true });
    expect(leadProducts({ insight: { isGym: true }, pipeline: { products: [] } })).toEqual({ products: [], inferred: false });
    expect(leadProducts({ pipeline: { products: ['spa', 'nope'] } })).toEqual({ products: ['spa'], inferred: false });
  });

  it('picks the first valid e-mail', () => {
    expect(leadEmail({ enrichment: { emails: ['bad', 'Info@Fit.com'] } })).toBe('info@fit.com');
    expect(leadEmail({ emails: ['satis@gym.com'] })).toBe('satis@gym.com');
    expect(leadEmail({ pipeline: { contact: { email: 'a@b.co' } }, email: 'x@y.z' })).toBe('a@b.co');
  });
});

describe('sales templates', () => {
  it('fills placeholders, including Turkish spellings', () => {
    const out = renderSalesText('{{İşletme}} ({{ilçe}}) için {{urun}}: {{fiyat}} {{indirim}} {{bilinmeyen}}', {
      leadName: 'Fit Club',
      district: 'Konyaaltı',
      productLabel: 'Spor Salonu',
      price: { amount: 1490, period: 'monthly', discountPercent: 20 },
    });
    expect(out).toBe('Fit Club (Konyaaltı) için Spor Salonu: 1.490 ₺ / ay %20 {{bilinmeyen}}');
  });

  it('formats one-off prices without a period', () => {
    expect(formatPrice({ amount: 5000, period: 'once' })).toBe('5.000 ₺');
    expect(formatPrice(null)).toBe('');
  });

  it('builds click-to-chat links', () => {
    expect(manualLink('whatsapp', '+905321234567', 'Merhaba dünya')).toBe('https://wa.me/905321234567?text=Merhaba%20d%C3%BCnya');
    expect(manualLink('sms', '+905321234567', 'a b')).toBe('sms:+905321234567?body=a%20b');
  });
});

describe('PlatformSalesService.send', () => {
  function setup(opts: { whatsapp?: boolean; email?: boolean } = {}) {
    const db = new FakeFirestore();
    db.docs.set('aiLeads/l1', { id: 'l1', name: 'Fit Club', district: 'Muratpaşa', phone: '0532 123 45 67', insight: { isGym: true }, pipeline: { status: 'new' } });
    db.docs.set('aiLeads/l2', { id: 'l2', name: 'Sabit Hat Spor', phone: '0242 321 00 00', email: 'info@sabit.com' });
    const channels = {
      emailConfigured: () => opts.email ?? false,
      smsConfigured: () => false,
      whatsappConfigured: () => opts.whatsapp ?? false,
      resolveMailbox: async () => ({ resourceId: 'mb1', address: 'satis@odivon.com' }),
      sendEmail: jest.fn(async () => ({ ok: true })),
      sendSms: jest.fn(),
      sendWhatsapp: jest.fn(async () => ({ ok: true, providerMessageId: 'wamid.1' })),
      status: () => ({}),
    };
    const audit = { record: jest.fn(async () => undefined) };
    const service = new PlatformSalesService({ db } as never, channels as never, audit as never, new SalesConsentService({ db } as never));
    return { db, channels, service };
  }

  it('falls back to manual wa.me links when WhatsApp is not configured and moves the lead to contacted', async () => {
    const { db, service, channels } = setup();
    const res = await service.send(
      { leadIds: ['l1', 'l2'], channel: 'whatsapp', kind: 'offer', body: 'Merhaba {{isletme}}, {{urun}} teklifimiz', followUpInDays: 3 },
      admin,
    );
    expect(res.mode).toBe('manual');
    expect(channels.sendWhatsapp).not.toHaveBeenCalled();
    expect(res.sent).toBe(1);
    expect(res.results[0].link).toContain('https://wa.me/905321234567?text=Merhaba%20Fit%20Club');
    expect(res.results[1]).toMatchObject({ leadId: 'l2', ok: false });

    const offers = [...db.docs.entries()].filter(([k]) => k.startsWith('salesOffers/')).map(([, v]) => v);
    expect(offers).toHaveLength(1);
    expect(offers[0]).toMatchObject({ leadId: 'l1', product: 'gym', status: 'sent', deliveryMode: 'manual', body: 'Merhaba Fit Club, Spor Salonu teklifimiz' });
    const followUps = [...db.docs.entries()].filter(([k]) => k.startsWith('salesActivities/')).map(([, v]) => v);
    expect(followUps).toHaveLength(1);
    expect(followUps[0]).toMatchObject({ type: 'followup', done: false, leadId: 'l1' });
    expect(db.docs.get('aiLeads/l1')).toMatchObject({ 'pipeline.status': 'contacted', 'pipeline.products': ['gym'] });
  });

  it('sends e-mail through the provider and requires a subject', async () => {
    const { service, channels } = setup({ email: true });
    await expect(service.send({ leadIds: ['l2'], channel: 'email', body: 'x' }, admin)).rejects.toThrow('konusu');
    const res = await service.send({ leadIds: ['l2'], channel: 'email', subject: '{{isletme}} için teklif', body: 'Selam' }, admin);
    expect(res.sent).toBe(1);
    expect(channels.sendEmail).toHaveBeenCalledWith('mb1', expect.objectContaining({ to: 'info@sabit.com', subject: 'Sabit Hat Spor için teklif' }));
  });

  it('refuses API mode when the provider is missing', async () => {
    const { service } = setup();
    await expect(service.send({ leadIds: ['l1'], channel: 'sms', body: 'x', mode: 'api' }, admin)).rejects.toThrow('SMS');
  });
});

describe('sales template library', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { SALES_TEMPLATE_LIBRARY, LIBRARY_PRODUCTS } = require('./sales-template-library');

  it('has e-mail, WhatsApp and SMS templates for each of the 5 main products', () => {
    for (const p of LIBRARY_PRODUCTS) {
      const mine = SALES_TEMPLATE_LIBRARY.filter((t: { product: string }) => t.product === p);
      expect(mine.map((t: { channel: string }) => t.channel).sort()).toEqual(['email', 'email', 'email', 'sms', 'sms', 'whatsapp', 'whatsapp']);
    }
    const ids = SALES_TEMPLATE_LIBRARY.map((t: { id: string }) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('sends a brochure with the live product price and a default validity date', async () => {
    const db = new FakeFirestore();
    db.docs.set('aiLeads/v1', { id: 'v1', name: 'Pati <Klinik>', district: 'Kepez', email: 'info@pati.com' });
    const sendEmail = jest.fn(async () => ({ ok: true }));
    const channels = {
      emailConfigured: () => true,
      resolveMailbox: async () => ({ resourceId: 'mb1', address: 'satis@odivon.com' }),
      sendEmail,
    };
    const pricing = { price: jest.fn(async () => 1990) };
    const service = new PlatformSalesService({ db } as never, channels as never, { record: async () => undefined } as never, new SalesConsentService({ db } as never), pricing as never);
    const res = await service.send({ leadIds: ['v1'], channel: 'email', templateId: 'lib:vet:email-brochure' }, admin);
    expect(res.sent).toBe(1);
    expect(pricing.price).toHaveBeenCalledWith('starter', 'monthly', 'vet');
    const mail = (sendEmail.mock.calls[0] as unknown[])[1] as { subject: string; html: string; text: string };
    expect(mail.subject).toBe('Pati <Klinik> için Odivon Vet teklifi');
    expect(mail.html).toContain('Pati &lt;Klinik&gt;');
    expect(mail.html).toContain('1.990 ₺ / ay');
    expect(mail.html).not.toContain('{{');
    expect(mail.text).toContain('Aşı ve kontrol takvimi');
  });

  it('copies library templates into editable templates', async () => {
    const db = new FakeFirestore();
    const service = new PlatformSalesService({ db } as never, {} as never, { record: async () => undefined } as never, new SalesConsentService({ db } as never));
    const res = await service.importLibrary({ product: 'hair' }, admin);
    expect(res.created).toBe(7);
    const saved = [...db.docs.values()];
    expect(saved.every((t) => t.product === 'hair' && String(t.sourceLibraryId).startsWith('lib:hair:'))).toBe(true);
  });
});
