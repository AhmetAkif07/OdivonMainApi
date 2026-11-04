import { ErrorCode } from '../../../shared/errors/error-codes';
import { ClinicPage } from './paging.entity';
import { PagingService } from './paging.service';

describe('PagingService', () => {
  const pages = { create: jest.fn(), since: jest.fn(), getByIdOrThrow: jest.fn(), saveQuietly: jest.fn(), roles: jest.fn() };
  const identity = { listByCurrentTenant: jest.fn() };
  let me = 'dr';
  const tenant = { getUserId: () => me, getStore: () => ({ email: 'me@x', displayName: null }) };
  let service: PagingService;

  const page = (overrides: Partial<ClinicPage>): ClinicPage =>
    ({
      id: 'p',
      createdAt: '2026-11-04T10:00:00.000Z',
      fromUserId: 'dr',
      fromName: 'Dr. Ece',
      targetType: 'user',
      targetId: 'nurse',
      targetLabel: 'Hemşire',
      recipientIds: ['nurse'],
      priority: 'normal',
      message: 'Ameliyathaneye',
      acks: {},
      ...overrides,
    }) as ClinicPage;

  beforeEach(() => {
    jest.resetAllMocks();
    me = 'dr';
    identity.listByCurrentTenant.mockResolvedValue([
      { uid: 'dr', displayName: 'Dr. Ece', email: 'e@x', status: 'active', roleIds: ['vet'] },
      { uid: 'nurse', displayName: 'Ayla', email: 'a@x', status: 'active', roleIds: ['tech'] },
      { uid: 'tech2', displayName: '', email: 'b@x', status: 'active', roleIds: ['tech'] },
      { uid: 'gone', displayName: 'Eski', email: 'g@x', status: 'inactive', roleIds: ['tech'] },
    ]);
    pages.roles.mockResolvedValue([
      { id: 'tech', name: 'Teknisyen' },
      { id: 'vet', name: 'Hekim' },
      { id: 'empty', name: 'Boş' },
    ]);
    pages.create.mockImplementation(async (fields) => ({ id: 'new', ...fields }));
    pages.saveQuietly.mockImplementation(async (item) => item);
    service = new PagingService(pages as never, identity as never, tenant as never);
  });

  it('resolves a role to its active members and labels the page', async () => {
    const sent = await service.send({ targetType: 'role', targetId: 'tech', priority: 'urgent', message: ' Acil kan alımı ' });
    expect(sent).toMatchObject({
      fromName: 'Dr. Ece',
      targetLabel: 'Teknisyen',
      recipientIds: ['nurse', 'tech2'],
      priority: 'urgent',
      message: 'Acil kan alımı',
    });
  });

  it('leaves the sender out of an everyone page and refuses an empty audience', async () => {
    const sent = await service.send({ targetType: 'all', message: 'Toplantı' });
    expect(sent.recipientIds).toEqual(['nurse', 'tech2']);
    await expect(service.send({ targetType: 'role', targetId: 'vet', message: 'x' })).rejects.toMatchObject({
      code: ErrorCode.VALIDATION_ERROR,
    });
    await expect(service.send({ targetType: 'user', targetId: 'gone', message: 'x' })).rejects.toMatchObject({
      code: ErrorCode.VALIDATION_ERROR,
    });
  });

  it('lists recipients without me and only roles that have members', async () => {
    const result = await service.recipients();
    expect(result.users.map((user) => user.uid)).toEqual(['nurse', 'tech2']);
    expect(result.roles).toEqual([
      { id: 'vet', name: 'Hekim', memberCount: 1 },
      { id: 'tech', name: 'Teknisyen', memberCount: 2 },
    ]);
  });

  it('shows my inbox with unread and urgent counts, within the last day', async () => {
    me = 'nurse';
    pages.since.mockResolvedValue([
      page({ id: 'a', priority: 'urgent' }),
      page({ id: 'b', createdAt: '2026-11-04T11:00:00.000Z', acks: { nurse: '2026-11-04T11:01:00.000Z' } }),
      page({ id: 'c', recipientIds: ['tech2'] }),
    ]);
    const now = new Date('2026-11-04T12:00:00.000Z');
    const inbox = await service.inbox({ since: '2026-01-01T00:00:00.000Z' }, now);
    expect(pages.since).toHaveBeenCalledWith('createdAt', '2026-11-03T12:00:00.000Z');
    expect(inbox.items.map((item) => item.id)).toEqual(['b', 'a']);
    expect(inbox).toMatchObject({ unread: 1, urgentUnread: 1 });
  });

  it('acknowledges once and only for recipients', async () => {
    me = 'nurse';
    pages.getByIdOrThrow.mockResolvedValue(page({}));
    const acked = await service.acknowledge('p');
    expect(acked.acks.nurse).toBeDefined();
    me = 'tech2';
    await expect(service.acknowledge('p')).rejects.toMatchObject({ code: ErrorCode.CLINIC_PAGE_NOT_FOUND });
  });

  it('reports who has not acknowledged a sent page', async () => {
    pages.since.mockResolvedValue([page({ recipientIds: ['nurse', 'tech2'], acks: { nurse: 'x' } })]);
    const [sent] = await service.sent(new Date('2026-11-04T12:00:00.000Z'));
    expect(sent).toMatchObject({ ackCount: 1, recipientCount: 2, pendingNames: ['b@x'] });
  });
});
