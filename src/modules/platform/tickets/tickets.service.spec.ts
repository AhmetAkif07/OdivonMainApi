import { FakeFirestore } from '../../../shared/testing/fake-firestore';
import { PlatformTicketsService } from './tickets.service';

describe('PlatformTicketsService privacy', () => {
  let db: FakeFirestore;
  let service: PlatformTicketsService;
  const ticket = (over: Record<string, unknown>) => ({
    trackingNumber: 'TK-2026-123456', category: 'bug', categoryLabel: 'Hata', subject: 'Giriş', description: 'gizli',
    fullName: 'Ayşe', email: 'ayse@x.com', phone: '555', adminNote: 'iç not', status: 'pending',
    createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z', userId: null, ...over,
  });

  beforeEach(() => {
    db = new FakeFirestore();
    service = new PlatformTicketsService({ db } as never);
  });

  it('track returns status only, no contact details or notes', async () => {
    db.docs.set('supportTickets/TK-2026-123456', ticket({}));
    const result = (await service.trackTicket('tk-2026-123456')) as unknown as Record<string, unknown>;
    expect(result['status']).toBe('pending');
    for (const key of ['email', 'phone', 'description', 'adminNote', 'fullName', 'tenantId']) expect(result).not.toHaveProperty(key);
  });

  it('rejects malformed tracking codes without a lookup', async () => {
    await expect(service.trackTicket('../users/x')).rejects.toMatchObject({ code: 'CRM_NOT_FOUND' });
  });

  it('my tickets needs a signed-in user', async () => {
    db.docs.set('supportTickets/a', ticket({}));
    await expect(service.getMyTickets('ayse@x.com', undefined)).resolves.toEqual([]);
  });

  it('new tracking codes are long and random', () => {
    const codes = new Set(Array.from({ length: 200 }, () => (service as unknown as { generateTrackingNumber(): string }).generateTrackingNumber()));
    expect(codes.size).toBe(200);
    for (const code of codes) expect(code).toMatch(/^TK-\d{4}-[A-HJ-NP-Z2-9]{10}$/);
  });
});
