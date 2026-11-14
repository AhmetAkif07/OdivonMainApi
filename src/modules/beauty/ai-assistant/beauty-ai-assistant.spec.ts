import { BeautyAiAssistantService, istanbulNow } from './beauty-ai-assistant.service';

/** Firestore'un bu serviste kullanılan küçük bir bellek içi taklidi. */
function fakeDb(seed: Record<string, Record<string, unknown>>) {
  const docs = new Map(Object.entries(seed));
  const ref = (path: string) => ({
    get: async () => ({ exists: docs.has(path), data: () => docs.get(path), id: path.split('/').pop() }),
    set: async (data: Record<string, unknown>, opts?: { merge?: boolean }) => {
      docs.set(path, opts?.merge ? { ...(docs.get(path) ?? {}), ...data } : data);
    },
  });
  return {
    docs,
    db: {
      doc: (path: string) => ref(path),
      collection: (name: string) => ({ doc: (id: string) => ref(`${name}/${id}`) }),
    },
  };
}

describe('BeautyAiAssistantService', () => {
  const tomorrow = '2099-01-02';
  let fake: ReturnType<typeof fakeDb>;
  let booking: Record<string, jest.Mock>;
  let service: BeautyAiAssistantService;
  let create: jest.Mock;
  let createImpl: jest.Mock;
  let sent: any[][];

  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    fake = fakeDb({
      'publicSlugs/salon': { tenantId: 't1', branchId: 'b1' },
      'tenants/t1/beautyBranches/b1': { aiAssistant: { enabled: true, instructions: '' } },
    });
    booking = {
      info: jest.fn().mockResolvedValue({ businessName: 'Lale', branchName: 'Merkez', address: '', phone: '' }),
      services: jest.fn().mockResolvedValue([{ id: 's1', name: 'Manikür', durationMin: 45, price: 400 }]),
      staff: jest.fn(),
      slots: jest.fn().mockResolvedValue({ date: tomorrow, durationMin: 45, slots: [{ time: '14:00' }, { time: '15:00' }] }),
      book: jest.fn().mockResolvedValue({
        id: 'a1', status: 'pending', serviceName: 'Manikür', staffName: 'Ayşe',
        startAt: `${tomorrow}T14:00:00+03:00`, branchName: 'Merkez', branchPhone: '',
      }),
    };
    service = new BeautyAiAssistantService(booking as never, fake as never);
    sent = [];
    create = jest.fn();
    const inner = create;
    create = jest.fn((req: { messages: unknown }) => {
      sent.push(JSON.parse(JSON.stringify(req.messages)));
      return inner(req);
    });
    createImpl = inner;
    (service as unknown as { anthropic: unknown }).anthropic = { beta: { messages: { create } } };
  });

  const usage = { input_tokens: 10, output_tokens: 5 };

  it('runs tools, books the appointment and keeps the conversation', async () => {
    createImpl
      .mockResolvedValueOnce({
        stop_reason: 'tool_use', usage,
        content: [{ type: 'tool_use', id: 'u1', name: 'find_available_slots', input: { date: tomorrow, service_id: 's1', staff_id: null } }],
      })
      .mockResolvedValueOnce({
        stop_reason: 'tool_use', usage,
        content: [{ type: 'tool_use', id: 'u2', name: 'book_appointment', input: {
          service_id: 's1', date: tomorrow, time: '14:00', staff_id: null, full_name: 'Elif Yılmaz',
          phone: '0532 111 22 33', notes: null, kvkk_consent: true,
        } }],
      })
      .mockResolvedValueOnce({ stop_reason: 'end_turn', usage, content: [{ type: 'text', text: 'Randevunuz alındı.' }] });

    const res = await service.chat({ slug: 'salon', channel: 'web', message: 'Yarın 14:00 manikür' });

    expect(res.reply).toBe('Randevunuz alındı.');
    expect(res.bookings).toEqual([expect.objectContaining({ id: 'a1', dryRun: false })]);
    expect(booking.book).toHaveBeenCalledWith(
      'salon',
      expect.objectContaining({ serviceId: 's1', time: '14:00', phone: '05321112233', kvkkConsent: true }),
      'ai_assistant',
    );
    const toolResult = sent[1].at(-1).content[0];
    expect(JSON.parse(toolResult.content).times).toEqual(['14:00', '15:00']);
    const conv = fake.docs.get(`tenants/t1/beautyAiConversations/${res.conversationId}`)!;
    expect(JSON.parse(conv['messagesJson'] as string)).toHaveLength(6);
    expect(fake.docs.get(`tenants/t1/beautyAiUsage/${istanbulNow().date.slice(0, 7)}`)).toBeDefined();
  });

  it('refuses to book without KVKK consent and never writes in dry-run', async () => {
    createImpl
      .mockResolvedValueOnce({
        stop_reason: 'tool_use', usage,
        content: [{ type: 'tool_use', id: 'u1', name: 'book_appointment', input: {
          service_id: 's1', date: tomorrow, time: '14:00', staff_id: null, full_name: 'Elif',
          phone: '05321112233', notes: null, kvkk_consent: false,
        } }],
      })
      .mockResolvedValueOnce({
        stop_reason: 'tool_use', usage,
        content: [{ type: 'tool_use', id: 'u2', name: 'book_appointment', input: {
          service_id: 's1', date: tomorrow, time: '14:00', staff_id: null, full_name: 'Elif',
          phone: '05321112233', notes: null, kvkk_consent: true,
        } }],
      })
      .mockResolvedValueOnce({ stop_reason: 'end_turn', usage, content: [{ type: 'text', text: 'Tamam.' }] });

    const res = await service.chat({ slug: 'salon', channel: 'panel_test', message: 'x', dryRun: true, ignoreDisabled: true });

    const first = sent[1].at(-1).content[0];
    expect(first.is_error).toBe(true);
    expect(booking.book).not.toHaveBeenCalled();
    expect(res.bookings).toEqual([expect.objectContaining({ id: null, dryRun: true })]);
  });

  it('rejects public chat when the salon has the assistant switched off', async () => {
    fake.docs.set('tenants/t1/beautyBranches/b1', { aiAssistant: { enabled: false } });
    await expect(service.chat({ slug: 'salon', channel: 'web', message: 'merhaba' })).rejects.toThrow('kapalı');
    expect(create).not.toHaveBeenCalled();
  });
});
