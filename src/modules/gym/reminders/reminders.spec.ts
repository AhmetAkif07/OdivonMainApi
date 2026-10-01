import { TenantContext } from '../../../shared/tenancy/tenant.context';
import { buildSchedule } from '../ops/receivables.math';
import {
  DEFAULT_REMINDER_SETTINGS,
  expiringReminders,
  expiryMilestone,
  inactiveReminders,
  mergeSettings,
  overdueMilestone,
  overdueReminders,
  render,
  ReminderMember,
} from './reminders.rules';
import { GymRemindersService } from './reminders.service';

const S = DEFAULT_REMINDER_SETTINGS;
const member = (over: Partial<ReminderMember> = {}): ReminderMember => ({
  uid: 'm1',
  displayName: 'Ayşe Yılmaz',
  phone: '5551112233',
  membershipStatus: 'active',
  membershipStartsAt: '2026-01-01T09:00:00.000Z',
  membershipEndsAt: '2026-10-08T09:00:00.000Z',
  packageLabel: '3 Aylık',
  ...over,
});

describe('reminder rules', () => {
  it('uses thresholds as windows so a missed day still sends', () => {
    expect([8, 7, 5, 4, 3, 2, 1, 0, -1].map((d) => expiryMilestone(d, [7, 3, 1]))).toEqual([null, 7, 7, 7, 3, 3, 1, 1, null]);
    expect([0, 1, 6, 7, 13, 14, 29, 30, 90].map((d) => overdueMilestone(d, [1, 7, 14, 30]))).toEqual([null, 1, 1, 7, 7, 14, 14, 30, 30]);
  });

  it('keys expiry reminders by membership end date so every period is reminded again', () => {
    const [first] = expiringReminders([member()], '2026-10-01', S);
    expect(first).toMatchObject({ key: 'membership_expiring:m1:2026-10-08:7', milestone: 7 });
    expect(render(S.templates.membership_expiring.body, first.vars)).toBe(
      'Merhaba Ayşe, 3 Aylık üyeliğinin bitmesine 7 gün kaldı (08.10.2026). Yenilemek için resepsiyona uğrayabilirsin.',
    );
    const renewed = expiringReminders([member({ membershipEndsAt: '2027-01-08T09:00:00.000Z' })], '2027-01-01', S);
    expect(renewed[0].key).toBe('membership_expiring:m1:2027-01-08:7');
    expect(expiringReminders([member({ membershipStatus: 'frozen' })], '2026-10-01', S)).toEqual([]);
    expect(expiringReminders([member({ isArchived: true })], '2026-10-01', S)).toEqual([]);
  });

  it('reminds each overdue installment once per milestone', () => {
    const plan = {
      id: 'r1',
      userId: 'm1',
      memberName: 'Ayşe Yılmaz',
      memberPhone: null,
      status: 'open',
      installments: buildSchedule(1000, 2, '2026-09-20'),
    };
    const out = overdueReminders([plan], '2026-10-01', S);
    expect(out.map((c) => c.key)).toEqual(['installment_overdue:r1:1:7']);
    expect(render(S.templates.installment_overdue.body, out[0].vars)).toContain('20.09.2026 vadeli ₺500,00 taksit ödemen 11 gün gecikti');
    expect(overdueReminders([{ ...plan, status: 'paid' }], '2026-10-01', S)).toEqual([]);
  });

  it('reminds absent members once per absence, re-armed after a visit', () => {
    const none = new Set<string>();
    expect(inactiveReminders([member()], '2026-10-01', S, none, new Map(), none).map((c) => c.key)).toEqual([
      'inactive_member:m1:2026-10-01',
    ]);
    expect(inactiveReminders([member()], '2026-10-01', S, new Set(['m1']), new Map(), none)).toEqual([]);
    const reminded = new Map([['m1', '2026-09-20T05:00:00.000Z']]);
    expect(inactiveReminders([member()], '2026-10-01', S, none, reminded, none)).toEqual([]);
    expect(inactiveReminders([member()], '2026-10-01', S, none, reminded, new Set(['m1']))).toHaveLength(1);
    expect(inactiveReminders([member({ membershipStartsAt: '2026-09-25T09:00:00.000Z' })], '2026-10-01', S, none, new Map(), none)).toEqual([]);
  });

  it('merges stored settings over defaults, SMS off unless chosen', () => {
    const merged = mergeSettings({ inactiveDays: 21, templates: { inactive_member: { title: 'Gel!' } } } as never);
    expect(merged.smsEnabled).toBe(false);
    expect(merged.inactiveDays).toBe(21);
    expect(merged.templates.inactive_member).toEqual({ title: 'Gel!', body: S.templates.inactive_member.body });
  });
});

describe('GymRemindersService.runForTenant', () => {
  function harness(settings: object | null = null) {
    const docs = new Map<string, Record<string, unknown>>();
    const created: { name: string; fields: Record<string, unknown> }[] = [];
    const reminders = {
      doc: (id: string) => ({
        id,
        create: jest.fn(async (data: Record<string, unknown>) => {
          if (docs.has(id)) throw new Error('ALREADY_EXISTS');
          docs.set(id, data);
        }),
        update: jest.fn(async (patch: Record<string, unknown>) => docs.set(id, { ...docs.get(id), ...patch })),
      }),
      where: () => ({ get: async () => ({ docs: [] }) }),
    };
    const accessLogs = { where: () => ({ get: async () => ({ docs: [] }) }) };
    const store = {
      getSingleton: jest.fn(async () => settings),
      collection: (name: string) => (name === 'gymReminders' ? reminders : accessLogs),
      list: jest.fn(async () => []),
      create: jest.fn(async (name: string, fields: Record<string, unknown>) => created.push({ name, fields })),
    };
    const firebase = {
      db: {
        getAll: async (...refs: { id: string }[]) => refs.map((r) => ({ id: r.id, exists: docs.has(r.id) })),
      },
    };
    const members = { list: jest.fn(async () => [member()]) };
    const ops = { sendSms: jest.fn(async () => ({ sentCount: 1, batchId: 'SMS-1' })) };
    const tenant = new TenantContext();
    jest.spyOn(tenant, 'getTenantId').mockReturnValue('t1');
    const service = new GymRemindersService(firebase as never, tenant, store as never, members as never, ops as never);
    return { service, docs, created, ops };
  }

  it('writes each reminder once, notifies the member in the app, sends no SMS by default', async () => {
    const h = harness();
    const first = await h.service.runForTenant({ day: '2026-10-01' });
    expect(first).toMatchObject({ created: 2, skippedExisting: 0, byType: { membership_expiring: 1, inactive_member: 1, installment_overdue: 0 } });
    expect([...h.docs.keys()].sort()).toEqual(['inactive_member:m1:2026-10-01', 'membership_expiring:m1:2026-10-08:7']);
    expect(h.created.filter((c) => c.name === 'gymMemberNotifications').map((c) => c.fields['type'])).toEqual([
      'membership_expiry_7',
      'inactive_member',
    ]);
    expect(h.ops.sendSms).not.toHaveBeenCalled();
    expect(h.docs.get('membership_expiring:m1:2026-10-08:7')).toMatchObject({ sms: 'disabled', day: '2026-10-01' });

    const again = await h.service.runForTenant({ day: '2026-10-01' });
    expect(again).toMatchObject({ created: 0, skippedExisting: 2 });
    expect(h.created.filter((c) => c.name === 'gymMemberNotifications')).toHaveLength(2);
  });

  it('dry run previews without writing anything', async () => {
    const h = harness();
    const preview = await h.service.runForTenant({ day: '2026-10-01', dryRun: true });
    expect(preview.preview?.map((p) => p.title)).toEqual(['Üyeliğin bitiyor', 'Seni özledik']);
    expect(h.docs.size).toBe(0);
    expect(h.created).toEqual([]);
  });

  it('uses the (simulated) SMS gateway only when the gym turned it on', async () => {
    const h = harness({ smsEnabled: true });
    await h.service.runForTenant({ day: '2026-10-01' });
    expect(h.ops.sendSms).toHaveBeenCalledTimes(2);
    expect(h.docs.get('membership_expiring:m1:2026-10-08:7')).toMatchObject({ sms: 'sent', smsBatchId: 'SMS-1' });
  });

  it('does nothing when reminders are switched off', async () => {
    const h = harness({ enabled: false });
    expect(await h.service.runForTenant({ day: '2026-10-01' })).toMatchObject({ enabled: false, created: 0 });
    expect(h.docs.size).toBe(0);
  });
});
