import { FakeFirestore } from '../../../shared/testing/fake-firestore';
import { SalesAiService, classifyReplyHeuristic } from './sales-ai.service';
import { SalesAssistantService } from './sales-assistant.service';
import { SalesConsentService, instrumentEmail } from './sales-consent.service';
import { SalesReportService, istanbulWeekStart, weekId } from './sales-report.service';
import { SalesSequencesService } from './sales-sequences.service';
import { nextBusinessSlot, scoreLead } from './sales-scoring';
import { PlatformSalesService } from './sales.service';

const admin = { uid: 'admin1', email: 'admin@odivon.com' } as never;
const audit = { record: jest.fn(async () => undefined) };

function offers(db: FakeFirestore) {
  return [...db.docs.entries()].filter(([k]) => k.startsWith('salesOffers/')).map(([, v]) => v as Record<string, any>);
}

function activities(db: FakeFirestore) {
  return [...db.docs.entries()].filter(([k]) => k.startsWith('salesActivities/')).map(([, v]) => v as Record<string, any>);
}

function setup(opts: { email?: boolean; whatsapp?: boolean; ai?: Partial<SalesAiService> } = {}) {
  const db = new FakeFirestore();
  const channels = {
    emailConfigured: () => opts.email ?? true,
    smsConfigured: () => false,
    whatsappConfigured: () => opts.whatsapp ?? false,
    resolveMailbox: async () => ({ resourceId: 'mb1', address: 'satis@odivon.com' }),
    sendEmail: jest.fn(async () => ({ ok: true })),
    sendSms: jest.fn(),
    sendWhatsapp: jest.fn(async () => ({ ok: true })),
    status: () => ({}),
  };
  const consent = new SalesConsentService({ db } as never);
  const pricing = { price: jest.fn(async () => 1990) };
  const sales = new PlatformSalesService({ db } as never, channels as never, audit as never, consent, pricing as never);
  const ai = { configured: () => false, model: () => 'test-model', ...opts.ai } as unknown as SalesAiService;
  const assistant = new SalesAssistantService({ db } as never, sales, ai, consent, audit as never, pricing as never);
  const sequences = new SalesSequencesService({ db } as never, sales, channels as never, audit as never);
  return { db, channels, consent, sales, assistant, sequences, pricing };
}

describe('lead scoring', () => {
  const now = Date.parse('2026-11-18T08:00:00Z'); // Çarşamba 11:00 İstanbul

  it('suggests a WhatsApp intro for a hot new lead with a mobile number', () => {
    const s = scoreLead({ name: 'Fit', phone: '0532 111 22 33', insight: { priority: 'sicak', odivonFit: 2.5 }, pipeline: { status: 'new' } }, now);
    expect(s.temperature).toBe('warm');
    expect(s.score).toBeGreaterThanOrEqual(55);
    expect(s.nextAction).toMatchObject({ type: 'whatsapp', kind: 'offer' });
  });

  it('asks for a call once the lead replied or clicked', () => {
    expect(scoreLead({ phone: '0242 000 00 00', pipeline: { status: 'replied' } }, now).nextAction?.type).toBe('call');
    const clicked = scoreLead({ phone: '0532 111 22 33', pipeline: { status: 'contacted', lastContactAt: '2026-11-17T08:00:00Z', lastClickAt: '2026-11-17T09:00:00Z' } }, now);
    expect(clicked.nextAction).toMatchObject({ type: 'call', label: 'Hemen arayın' });
    expect(clicked.factors).toContain('Son 7 günde teklife tıkladı');
  });

  it('switches channel after silence and stops for opted-out or closed leads', () => {
    const silent = scoreLead({ phone: '0532 111 22 33', email: 'a@b.co', pipeline: { status: 'contacted', lastOfferChannel: 'whatsapp', lastContactAt: '2026-11-13T08:00:00Z', offerCount: 1 } }, now);
    expect(silent.nextAction).toMatchObject({ type: 'email', kind: 'followup' });
    expect(scoreLead({ phone: '0532 111 22 33', pipeline: { status: 'new', optedOut: { at: 'x' } } }, now).nextAction).toBeNull();
    expect(scoreLead({ phone: '0532 111 22 33', pipeline: { status: 'won' } }, now).nextAction).toBeNull();
  });

  it('moves out-of-hours actions to the next business morning', () => {
    expect(nextBusinessSlot(Date.parse('2026-11-21T10:00:00Z'))).toBe('2026-11-23T07:30:00.000Z'); // Cumartesi → Pazartesi 10:30
    expect(nextBusinessSlot(now)).toBe(new Date(now).toISOString());
  });
});

describe('consent and tracking', () => {
  it('rewrites links, adds the pixel and an unsubscribe line', () => {
    const r = instrumentEmail('<html><body><a href="https://odivon.com/x?a=1&amp;b=2">x</a><a href="https://odivon.com/x?a=1&amp;b=2">y</a></body></html>', 'Selam', 'tok123456789');
    expect(r.links).toEqual(['https://odivon.com/x?a=1&b=2']);
    expect(r.html).toContain('/api/v1/public/sales/o/tok123456789/c/0');
    expect(r.html).toContain('/o/tok123456789/p.gif');
    expect(r.html).toContain('/o/tok123456789/u');
    expect(r.text).toContain('almak istemiyorsanız');
  });

  it('never sends to suppressed addresses and tracks clicks, demo requests and unsubscribes', async () => {
    const { db, sales, assistant, consent, channels } = setup();
    db.docs.set('aiLeads/a', { id: 'a', name: 'Fit A', email: 'a@fit.com', pipeline: { status: 'new', products: ['gym'] } });
    db.docs.set('aiLeads/b', { id: 'b', name: 'Fit B', email: 'b@fit.com', pipeline: { status: 'new', products: ['gym'] } });
    await consent.add({ value: 'B@fit.com', reason: 'manual', source: 'panel' }, null);

    const res = await sales.send({ leadIds: ['a', 'b'], channel: 'email', templateId: 'lib:gym:email-brochure' }, admin);
    expect(res.sent).toBe(1);
    expect(res.results.find((r) => r.leadId === 'b')).toMatchObject({ ok: false, error: expect.stringContaining('Ret listesinde') });
    const mail = (channels.sendEmail.mock.calls[0] as unknown[])[1] as { html: string };
    const offer = offers(db)[0];
    expect(offer.publicToken).toMatch(/^[A-Za-z0-9_-]{16}$/);
    // CTA "Ücretsiz demo isteyin" teklife özel demo sayfasına gider (izlenen bağlantı olarak).
    expect(offer.links).toContain(`https://mainapi.odivon.com/api/v1/public/sales/o/${offer.publicToken}/demo`);
    expect(mail.html).toContain(`/o/${offer.publicToken}/c/`);

    const demoIndex = offer.links.indexOf(`https://mainapi.odivon.com/api/v1/public/sales/o/${offer.publicToken}/demo`);
    await expect(assistant.recordClick(offer.publicToken, demoIndex)).resolves.toContain('/demo');
    await expect(assistant.recordClick(offer.publicToken, 99)).resolves.toBe('https://odivon.com');
    expect(db.docs.get('aiLeads/a')).toHaveProperty(['pipeline.lastClickAt']);

    await assistant.requestDemo(offer.publicToken, { name: 'Ayşe <b>', phone: '0532 111 22 33', when: 'Salı' });
    expect(db.docs.get('aiLeads/a')).toMatchObject({ 'pipeline.status': 'demo', 'pipeline.contact.contactName': 'Ayşe b' });
    expect(activities(db).find((x) => x.type === 'demo')?.text).toContain('Tel: 0532 111 22 33');

    await expect(assistant.unsubscribe('bad-token-xxxx')).resolves.toEqual({ ok: false, leadName: null });
    await assistant.unsubscribe(offer.publicToken);
    expect(await consent.suppressed(['a@fit.com'])).toEqual(new Set(['a@fit.com']));
    expect(db.docs.get('aiLeads/a')).toHaveProperty(['pipeline.optedOut']);
  });
});

describe('sales assistant', () => {
  it('classifies replies without AI and moves the funnel', async () => {
    expect(classifyReplyHeuristic('Fiyatı ne kadar?')).toBe('price_question');
    expect(classifyReplyHeuristic('Lütfen beni listeden çıkarın')).toBe('unsubscribe');
    const { db, assistant, consent } = setup();
    db.docs.set('aiLeads/a', { id: 'a', name: 'Fit A', phone: '0532 111 22 33', pipeline: { status: 'contacted' } });
    const r = await assistant.logReply({ leadId: 'a', channel: 'whatsapp', text: 'Fiyat nedir?' }, admin);
    expect(r.aiUsed).toBe(false);
    expect(r.analysis.intent).toBe('price_question');
    expect(db.docs.get('aiLeads/a')).toMatchObject({ 'pipeline.status': 'replied' });
    expect(activities(db).some((x) => x.type === 'followup' && !x.done)).toBe(true);

    await assistant.logReply({ leadId: 'a', channel: 'whatsapp', text: 'Mesaj atmayın lütfen' }, admin);
    expect(db.docs.get('aiLeads/a')).toMatchObject({ 'pipeline.status': 'ignored' });
    expect(await consent.suppressed(['+905321112233'])).toEqual(new Set(['+905321112233']));
  });

  it('uses the AI classification and composes a personalised draft', async () => {
    const json = jest
      .fn()
      .mockResolvedValueOnce({ intent: 'demo_request', sentiment: 'positive', summary: 'Demo istiyor', suggestedReply: 'Harika, yarın 11?', followUpInDays: 1 })
      .mockResolvedValueOnce({ subject: 'Fit A için', body: 'Merhaba, {{fiyat}}', notes: 'Online üyelik vurgusu' });
    const real = new SalesAiService();
    const ai = { configured: () => true, model: () => 'm', json, classifyReply: real.classifyReply, compose: real.compose } as unknown as SalesAiService;
    const { db, assistant } = setup({ ai });
    db.docs.set('aiLeads/a', { id: 'a', name: 'Fit A', email: 'a@fit.com', strategy: { painPoints: ['Üyelik takibi elle'] }, pipeline: { status: 'contacted', products: ['gym'] } });

    const reply = await assistant.logReply({ leadId: 'a', channel: 'email', text: 'Demo görebilir miyiz?' }, admin);
    expect(reply).toMatchObject({ aiUsed: true, analysis: { intent: 'demo_request', suggestedReply: 'Harika, yarın 11?' } });
    expect(activities(db).find((x) => x.type === 'followup')?.text).toContain('Demo ayarlayın');

    const draft = await assistant.compose({ leadId: 'a', channel: 'email', templateId: 'lib:gym:email-brochure' }, admin);
    expect(draft).toMatchObject({ subject: 'Fit A için', body: 'Merhaba, {{fiyat}}', product: 'gym', price: { amount: 1990 } });
    const prompt = json.mock.calls[1][0] as string;
    expect(prompt).toContain('Üyelik takibi elle');
    expect(prompt).toContain('Odivon GYM');
    expect(prompt).toContain('1.990 ₺ / ay');
    expect(prompt).not.toContain('<td');
  });

  it('forecasts subscribers and revenue from the funnel', async () => {
    const { db, assistant } = setup();
    db.docs.set('aiLeads/a', { id: 'a', phone: '0532 111 22 33', insight: { priority: 'sicak', odivonFit: 3 }, pipeline: { status: 'demo', products: ['vet'] } });
    db.docs.set('aiLeads/b', { id: 'b', pipeline: { status: 'won', products: ['vet'], wonAt: new Date().toISOString() } });
    const f = await assistant.forecast({});
    expect(f.won90).toBe(1);
    expect(f.wonMrr90).toBe(1990);
    expect(f.expectedCustomers).toBeGreaterThan(0.3);
    expect(f.byProduct[0]).toMatchObject({ product: 'vet', openLeads: 1 });
  });

  it('lists today\'s actions ordered by score', async () => {
    const { db, assistant } = setup();
    db.docs.set('aiLeads/a', { id: 'a', name: 'Soğuk', phone: '0532 111 22 33', insight: { priority: 'soguk' }, pipeline: { status: 'new' }, lastSeenAt: '1' });
    db.docs.set('aiLeads/b', { id: 'b', name: 'Sıcak', phone: '0532 111 22 34', insight: { priority: 'sicak', odivonFit: 3 }, pipeline: { status: 'new' }, lastSeenAt: '2' });
    db.docs.set('aiLeads/c', { id: 'c', name: 'Kazanıldı', pipeline: { status: 'won' }, lastSeenAt: '3' });
    const t = await assistant.today({});
    expect(t.items.map((i) => i.name)).toEqual(['Sıcak', 'Soğuk']);
    expect(t.items[0].nextAction.type).toBe('whatsapp');
  });
});

describe('follow-up sequences', () => {
  it('runs due steps, creates manual tasks without a provider and stops when the lead replies', async () => {
    const { db, sequences, assistant } = setup({ email: true, whatsapp: false });
    db.docs.set('aiLeads/a', { id: 'a', name: 'Fit A', email: 'a@fit.com', phone: '0532 111 22 33', pipeline: { status: 'new', products: ['gym'] } });
    db.docs.set('aiLeads/b', { id: 'b', name: 'Fit B', pipeline: { status: 'new' } });

    await expect(sequences.create({ name: 'x', steps: [{ day: 0, channel: 'sms', templateId: 'lib:gym:email-brochure' }] }, admin)).rejects.toThrow('kanal');
    const seq = await sequences.create(
      {
        name: 'GYM 3 adım',
        product: 'gym',
        steps: [
          { day: 3, channel: 'whatsapp', templateId: 'lib:gym:whatsapp-followup' },
          { day: 0, channel: 'email', templateId: 'lib:gym:email-brochure' },
        ],
      },
      admin,
    );
    expect(seq.steps.map((s) => s.day)).toEqual([0, 3]);

    const en = await sequences.enroll(seq.id, ['a', 'b'], admin);
    expect(en.enrolled).toBe(1);
    expect(en.skipped[0]).toMatchObject({ leadId: 'b', reason: 'E-posta ve cep telefonu yok' });

    const first = await sequences.runDue();
    expect(first).toMatchObject({ processed: 1, sent: 1 });
    expect(offers(db)[0]).toMatchObject({ channel: 'email', batchId: `seq-${seq.id}` });
    const enrollment = [...db.docs.entries()].find(([k]) => k.startsWith('salesEnrollments/'))!;
    expect(enrollment[1]).toMatchObject({ stepIndex: 1, status: 'active' });

    // 2. adımın zamanını öne çek: WhatsApp sağlayıcısı yok → Takipler'e bağlantılı görev.
    db.docs.set(enrollment[0], { ...enrollment[1], nextRunAt: '2000-01-01T00:00:00.000Z' });
    const second = await sequences.runDue();
    expect(second).toMatchObject({ tasks: 1 });
    expect(activities(db).find((x) => x.link)?.link).toContain('https://wa.me/905321112233');
    expect(db.docs.get(enrollment[0])).toMatchObject({ status: 'completed', nextRunAt: null });

    // Yeni kayıt, cevap gelince durur.
    db.docs.set('aiLeads/a', { ...db.docs.get('aiLeads/a'), 'pipeline.status': 'contacted', pipeline: { status: 'contacted', products: ['gym'] } });
    await sequences.enroll(seq.id, ['a'], admin);
    const stopped = await assistant.logReply({ leadId: 'a', channel: 'email', text: 'İlgileniyorum, detay alabilir miyim?' }, admin);
    expect(stopped.stoppedSequences).toBe(1);
  });
});

describe('call prep and weekly report', () => {
  const prep = {
    goal: 'Demo randevusu',
    opener: 'Merhaba',
    questions: ['Üyeleri nasıl takip ediyorsunuz?'],
    talkingPoints: ['Online üyelik'],
    objections: [{ objection: 'Pahalı', answer: 'Deneme süresi var' }],
    closing: 'Salı 11 uygun mu?',
    avoid: ['Rakibi kötüleme'],
    voicemail: 'Size ulaşamadık',
  };

  it('prepares a call with lead context, price and objections', async () => {
    const json = jest.fn().mockResolvedValue(prep);
    const ai = { configured: () => true, model: () => 'm', json } as unknown as SalesAiService;
    const { db, assistant } = setup({ ai });
    db.docs.set('aiLeads/a', { id: 'a', name: 'Fit A', phone: '0532 111 22 33', enrichment: { competitors: ['RakipSoft'] }, pipeline: { status: 'replied', products: ['gym'] } });
    const r = await assistant.callPrep({ leadId: 'a' }, admin);
    expect(r).toMatchObject({ goal: 'Demo randevusu', objections: [{ objection: 'Pahalı' }], product: 'gym', price: { amount: 1990 }, phone: '+905321112233' });
    const prompt = json.mock.calls[0][0] as string;
    expect(prompt).toContain('RakipSoft');
    expect(prompt).toContain('1.990 ₺ / ay');
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'SALES_AI_CALL_PREP' }));
  });

  it('computes Istanbul weeks', () => {
    // Salı 01:30 TR = Pazartesi 22:30 UTC → hafta 16 Kasım Pazartesi başlar.
    const now = new Date('2026-11-16T22:30:00Z');
    expect(weekId(istanbulWeekStart(now))).toBe('2026-11-16');
    expect(istanbulWeekStart(now).toISOString()).toBe('2026-11-15T21:00:00.000Z');
    expect(weekId(istanbulWeekStart(now, 1))).toBe('2026-11-09');
  });

  it('builds the weekly report with template attribution and runs once on Monday morning', async () => {
    const json = jest.fn().mockResolvedValue({ headline: 'İyi hafta', wins: ['WhatsApp'], issues: [], actions: ['Daha çok ara'] });
    const ai = { configured: () => true, model: () => 'm', json } as unknown as SalesAiService;
    const { db, assistant, channels } = setup({ ai });
    const reports = new SalesReportService({ db } as never, ai, assistant, channels as never);
    // Geçen hafta: 9-15 Kasım (TR). "now" = 16 Kasım Pazartesi 09:00 TR.
    const now = new Date('2026-11-16T06:00:00Z');
    const offer = (id: string, o: Record<string, unknown>) => db.docs.set(`salesOffers/${id}`, { id, status: 'sent', deliveryMode: 'api', ...o });
    offer('o1', { leadId: 'a', channel: 'email', templateId: 't1', templateName: 'Broşür', product: 'gym', createdAt: '2026-11-11T08:00:00Z', openCount: 2, clickCount: 1, demoRequestedAt: '2026-11-12T08:00:00Z' });
    offer('o2', { leadId: 'b', channel: 'whatsapp', templateId: 't2', templateName: 'WA teklif', product: 'gym', createdAt: '2026-11-11T09:00:00Z' });
    offer('o3', { leadId: 'c', channel: 'email', templateId: 't1', templateName: 'Broşür', product: 'vet', createdAt: '2026-11-12T09:00:00Z', status: 'failed' });
    offer('o0', { leadId: 'b', channel: 'sms', templateId: 't3', templateName: 'Eski', product: 'gym', createdAt: '2026-11-05T09:00:00Z' });
    db.docs.set('salesActivities/r1', { leadId: 'b', type: 'reply', intent: 'price_question', createdAt: '2026-11-13T09:00:00Z' });
    db.docs.set('salesActivities/c1', { leadId: 'a', type: 'call', createdAt: '2026-11-13T10:00:00Z' });
    db.docs.set('salesActivities/f1', { leadId: 'a', type: 'followup', done: false, dueAt: '2026-11-14T10:00:00Z', createdAt: '2026-11-13T10:00:00Z' });
    db.docs.set('aiLeads/b', { id: 'b', lastSeenAt: '1', pipeline: { status: 'won', products: ['gym'], wonAt: '2026-11-14T09:00:00Z' } });

    const r = await reports.generate({ week: 'last', now }, { uid: 'u', email: 'admin@odivon.com' });
    expect(r.id).toBe('2026-11-09');
    expect(r.partial).toBe(false);
    expect(r.totals).toMatchObject({ sent: 2, failed: 1, emailSent: 1, opened: 1, clicked: 1, replies: 1, positive: 1, demos: 1, won: 1, wonMrr: 1990, calls: 1, openRate: 100 });
    expect(r.prevTotals).toMatchObject({ sent: 1 });
    expect(r.overdueFollowups).toBe(1);
    const wa = r.byTemplate.find((b: Record<string, unknown>) => b.key === 't2');
    expect(wa).toMatchObject({ sent: 1, replies: 1, won: 1 });
    expect(r.insights).toMatchObject({ headline: 'İyi hafta' });
    expect(json.mock.calls[0][0]).toContain('WA teklif');

    process.env.SALES_REPORT_EMAIL = 'info@odivon.com';
    try {
      // Pazartesi 07:00 TR: henüz değil. Salı: değil.
      expect(await reports.runWeekly(new Date('2026-11-16T04:00:00Z'))).toEqual({ generated: null, emailed: false });
      expect(await reports.runWeekly(new Date('2026-11-17T06:00:00Z'))).toEqual({ generated: null, emailed: false });
      // Rapor zaten tam: tekrar üretilmez.
      expect(await reports.runWeekly(now)).toEqual({ generated: null, emailed: false });
      db.docs.delete('salesReports/2026-11-09');
      expect(await reports.runWeekly(now)).toEqual({ generated: '2026-11-09', emailed: true });
      expect(channels.sendEmail).toHaveBeenCalledWith('mb1', expect.objectContaining({ to: 'info@odivon.com', subject: expect.stringContaining('2026-11-09') }));
    } finally {
      delete process.env.SALES_REPORT_EMAIL;
    }
    expect((await reports.list())[0]).toMatchObject({ id: '2026-11-09', headline: 'İyi hafta' });
  });
});

describe('AI provider', () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
    jest.restoreAllMocks();
  });

  it('prefers Gemini when GEMINI_API_KEY is set and parses its JSON answer', async () => {
    process.env.GEMINI_API_KEY = 'g-key';
    process.env.ANTHROPIC_API_KEY = 'a-key';
    delete process.env.SALES_AI_PROVIDER;
    const ai = new SalesAiService();
    expect(ai.provider()).toBe('gemini');
    expect(ai.model()).toBe('gemini-3.8-flash');
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '```json\n{"subject":"S","body":"B","notes":"N"}\n```' }] } }] }), { status: 200 }),
    );
    const out = await ai.compose({ channel: 'email', kind: 'offer', leadSummary: 'Ad: Fit', productFacts: null, priceText: null, history: null, baseTemplate: null, instructions: null });
    expect(out).toEqual({ subject: 'S', body: 'B', notes: 'N' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/models/gemini-3.8-flash:generateContent');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('g-key');
    expect(JSON.parse(init.body as string).generationConfig).toMatchObject({ responseMimeType: 'application/json', responseJsonSchema: { type: 'object' } });

    process.env.SALES_AI_PROVIDER = 'anthropic';
    expect(ai.provider()).toBe('anthropic');
  });

  it('retries without the schema on 400 and reports the free-tier limit on 429', async () => {
    process.env.GEMINI_API_KEY = 'g-key';
    const ai = new SalesAiService();
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response('bad schema', { status: 400 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"a":1}' }] } }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response('quota', { status: 429 }));
    await expect(ai.json('x', { type: 'object' })).resolves.toEqual({ a: 1 });
    const second = JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string);
    expect(second.generationConfig.responseJsonSchema).toBeUndefined();
    expect(second.contents[0].parts[0].text).toContain('JSON şemasına');
    await expect(ai.json('x', { type: 'object' })).rejects.toThrow('ücretsiz kullanım sınırı');
  });

  it('is not configured without any key', () => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    expect(new SalesAiService().configured()).toBe(false);
  });
});
