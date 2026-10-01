import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { TenantContext } from '../../../shared/tenancy/tenant.context';
import { FakeFirestore } from '../../../shared/testing/fake-firestore';
import { GymStore } from '../shared/gym-store';
import { funnelReport, LeadRecord, mergeReferralSettings, reachedStep, referralReward, stageChange } from './leads.rules';
import { GymLeadsService } from './leads.service';

const NOW = new Date('2026-10-01T09:00:00Z');

describe('lead funnel rules', () => {
  const lead = (over: Partial<LeadRecord>): LeadRecord => ({ id: 'l', createdAt: '2026-09-10T08:00:00Z', status: 'visited', ...over });

  it('appends stage changes to the history and stamps conversion', () => {
    const legacy = lead({ status: 'called' });
    const trial = stageChange(legacy, 'trial', 'staff', NOW);
    expect(trial.stageHistory!.map((e) => e.stage)).toEqual(['visited', 'trial']);
    const converted = stageChange({ ...legacy, ...trial }, 'converted', 'staff', NOW);
    expect(converted).toMatchObject({ status: 'converted', convertedAt: NOW.toISOString() });
    expect(stageChange({ ...legacy, ...converted }, 'converted', 'staff')).toEqual({});
  });

  it('counts how far each lead got, lost leads keep their furthest step', () => {
    expect(reachedStep(lead({ status: 'visited' }))).toBe(0);
    expect(reachedStep(lead({ status: 'called' }))).toBe(1); // legacy record without history
    const lostAfterTrial = lead({
      status: 'lost',
      stageHistory: [
        { stage: 'visited', at: 'a', by: '' },
        { stage: 'trial', at: 'b', by: '' },
        { stage: 'lost', at: 'c', by: '' },
      ],
    });
    expect(reachedStep(lostAfterTrial)).toBe(2);
  });

  it('builds the funnel with sources, staff, lost reasons and time to convert', () => {
    const leads: LeadRecord[] = [
      lead({ id: '1', source: 'instagram', assignedStaffName: 'Ayşe' }),
      lead({ id: '2', source: 'instagram', status: 'called', followUpDate: '2026-09-20T00:00:00Z' }),
      lead({ id: '3', source: 'referral', status: 'converted', convertedAt: '2026-09-14T08:00:00Z', referrerMemberId: 'm1' }),
      lead({ id: '4', source: 'walk_in', status: 'lost', lostReason: 'Fiyat' }),
      lead({ id: '5', createdAt: '2026-08-01T08:00:00Z', status: 'converted' }), // outside the range
      lead({ id: '6', deletedAt: 'x' }),
    ];
    const report = funnelReport(leads, { from: '2026-09-01', to: '2026-09-30' }, '2026-10-01');
    expect(report).toMatchObject({ total: 4, converted: 1, lost: 1, open: 2, conversionRate: 25, avgDaysToConvert: 4, overdueFollowUps: 1, referrals: 1 });
    expect(report.stages.map((s) => [s.stage, s.reached])).toEqual([
      ['visited', 4],
      ['called', 2],
      ['trial', 1],
      ['converted', 1],
    ]);
    expect(report.bySource[0]).toEqual({ key: 'instagram', leads: 2, converted: 0, conversionRate: 0 });
    expect(report.byStaff.find((s) => s.key === 'unassigned')).toMatchObject({ leads: 3 });
    expect(report.lostReasons).toEqual([{ reason: 'Fiyat', count: 1 }]);
  });

  it('gives no referral reward unless the programme is on', () => {
    expect(mergeReferralSettings(null)).toEqual({ enabled: false, rewardType: 'wallet', rewardAmount: 0, rewardDays: 0 });
    expect(referralReward(mergeReferralSettings({ rewardAmount: 100 }), {})).toBeNull();
    const wallet = mergeReferralSettings({ enabled: true, rewardAmount: 150.255 });
    expect(referralReward(wallet, { walletBalance: -20.1 })).toEqual({ status: 'granted', type: 'wallet', amount: 150.26, walletBalance: 130.16 });
    const days = mergeReferralSettings({ enabled: true, rewardType: 'days', rewardDays: 7 });
    expect(referralReward(days, { membershipStatus: 'active', membershipEndsAt: '2026-10-10T00:00:00.000Z' }, NOW)).toEqual({
      status: 'granted',
      type: 'days',
      days: 7,
      membershipEndsAt: '2026-10-17T00:00:00.000Z',
    });
    expect(referralReward(days, { membershipStatus: 'expired', membershipEndsAt: '2026-09-01T00:00:00Z' }, NOW)).toMatchObject({ status: 'pending' });
  });
});

describe('GymLeadsService', () => {
  let db: FakeFirestore;
  let service: GymLeadsService;
  let as: <T>(fn: () => Promise<T>) => Promise<T>;

  const path = (collection: string, id = '') => `tenants/t1/${collection}${id ? `/${id}` : ''}`;
  const rows = (collection: string) =>
    [...db.docs.entries()].filter(([key]) => key.startsWith(`${path(collection)}/`)).map(([, value]) => value);
  const doc = (collection: string, id: string) => db.docs.get(path(collection, id))!;
  const member = (uid: string, over: Record<string, unknown> = {}) =>
    db.docs.set(path('gymMembers', uid), { uid, displayName: uid.toUpperCase(), walletBalance: 0, deletedAt: null, ...over });
  const lead = (id: string, over: Record<string, unknown> = {}) =>
    db.docs.set(path('gymGuestMembers', id), { id, fullName: 'Aday', createdAt: '2026-09-20T08:00:00Z', status: 'trial', deletedAt: null, ...over });
  const settings = (over: Record<string, unknown>) =>
    db.docs.set(path('gymReferralSettings', 't1'), { id: 't1', deletedAt: null, ...over });

  beforeEach(() => {
    jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate'] });
    db = new FakeFirestore();
    const context = new TenantContext();
    service = new GymLeadsService(new GymStore({ db } as never, context));
    as = (fn) => context.run({ tenantId: 't1', userId: 'staff-1', role: 'owner', modules: ['gym'], email: '' }, fn);
  });
  afterEach(() => jest.useRealTimers());

  async function expectCode(promise: Promise<unknown>, code: string) {
    await expect(promise).rejects.toBeInstanceOf(AppException);
    await promise.catch((e: AppException) => expect(e.code).toBe(code));
  }

  it('converts a lead without rewards while the programme is off (default)', async () => {
    member('ref');
    member('new');
    lead('l1', { source: 'referral', referrerMemberId: 'ref' });
    const result = await as(() => service.convert('l1', { memberId: 'new' }));
    expect(result).toEqual({ leadId: 'l1', memberId: 'new', referrerMemberId: 'ref', reward: null });
    expect(doc('gymGuestMembers', 'l1')).toMatchObject({ status: 'converted', convertedMemberId: 'new', convertedAt: NOW.toISOString() });
    expect(doc('gymMembers', 'new')).toMatchObject({ leadId: 'l1', leadSource: 'referral', referredByMemberId: 'ref', referredByName: 'REF' });
    expect(rows('gymReferralRewards')).toHaveLength(0);
    expect(doc('gymMembers', 'ref')['walletBalance']).toBe(0);
  });

  it('rewards the referrer once into the wallet, even when converted twice at the same time', async () => {
    settings({ enabled: true, rewardType: 'wallet', rewardAmount: 250 });
    member('ref', { walletBalance: 10 });
    member('new');
    lead('l1', { referrerMemberId: 'ref' });
    await Promise.all([
      as(() => service.convert('l1', { memberId: 'new' })),
      as(() => service.convert('l1', { memberId: 'new' })),
      as(() => service.recordReferral({ referrerMemberId: 'ref', memberId: 'new' })),
    ]);
    expect(doc('gymMembers', 'ref')['walletBalance']).toBe(260);
    expect(rows('gymReferralRewards')).toEqual([
      expect.objectContaining({ id: 'member_new', referrerMemberId: 'ref', referredMemberId: 'new', type: 'wallet', amount: 250, status: 'granted', leadId: 'l1' }),
    ]);
    expect(rows('gymWalletTx')).toEqual([expect.objectContaining({ userId: 'ref', type: 'deposit', amount: 250, referenceType: 'referral' })]);
    expect(rows('gymMemberNotifications')).toEqual([expect.objectContaining({ userId: 'ref', type: 'referral_reward' })]);
    const summary = await as(() => service.rewards());
    expect(summary.referrers).toEqual([{ referrerMemberId: 'ref', referrerName: 'REF', referrals: 1, walletTotal: 250, days: 0 }]);
    expect(await as(() => service.memberSummary('ref'))).toMatchObject({
      program: { enabled: true, rewardType: 'wallet', rewardAmount: 250 },
      referrals: [{ referredName: 'NEW', status: 'granted', amount: 250 }],
    });
  });

  it('extends a running membership, keeps the reward pending otherwise', async () => {
    settings({ enabled: true, rewardType: 'days', rewardDays: 10 });
    member('active', { membershipStatus: 'active', membershipEndsAt: '2026-10-05T00:00:00.000Z' });
    member('expired', { membershipStatus: 'expired', membershipEndsAt: '2026-09-01T00:00:00.000Z' });
    member('n1');
    member('n2');
    await as(() => service.recordReferral({ referrerMemberId: 'active', memberId: 'n1' }));
    await as(() => service.recordReferral({ referrerMemberId: 'expired', memberId: 'n2' }));
    expect(doc('gymMembers', 'active')['membershipEndsAt']).toBe('2026-10-15T00:00:00.000Z');
    expect(doc('gymMembers', 'expired')['membershipEndsAt']).toBe('2026-09-01T00:00:00.000Z');
    expect(doc('gymReferralRewards', 'member_n2')).toMatchObject({ status: 'pending', days: 10 });
    expect(rows('gymMemberNotifications')).toHaveLength(1);
  });

  it('refuses self referrals, a second referrer and converting a lead to another member', async () => {
    member('a');
    member('b');
    member('c');
    await expectCode(as(() => service.recordReferral({ referrerMemberId: 'a', memberId: 'a' })), ErrorCode.VALIDATION_ERROR);
    await as(() => service.recordReferral({ referrerMemberId: 'a', memberId: 'b' }));
    await expectCode(as(() => service.recordReferral({ referrerMemberId: 'c', memberId: 'b' })), ErrorCode.VALIDATION_ERROR);
    await expectCode(as(() => service.recordReferral({ referrerMemberId: 'a', memberId: 'ghost' })), ErrorCode.GYM_MEMBER_NOT_FOUND);

    lead('l1');
    await as(() => service.convert('l1', { memberId: 'b' }));
    await expectCode(as(() => service.convert('l1', { memberId: 'c' })), ErrorCode.VALIDATION_ERROR);
    await expectCode(as(() => service.convert('missing', { memberId: 'c' })), ErrorCode.GYM_GUEST_NOT_FOUND);
  });

  it('moves leads through stages with history; conversion only via convert', async () => {
    lead('l1', { status: 'visited' });
    const lost = await as(() => service.changeStage('l1', { stage: 'lost', lostReason: ' Fiyat yüksek ' }));
    expect(lost).toMatchObject({ status: 'lost', lostReason: 'Fiyat yüksek' });
    expect((lost['stageHistory'] as { stage: string }[]).map((e) => e.stage)).toEqual(['visited', 'lost']);
    await expectCode(as(() => service.changeStage('l1', { stage: 'converted' })), ErrorCode.VALIDATION_ERROR);
    const funnel = await as(() => service.funnel({}));
    expect(funnel).toMatchObject({ total: 1, lost: 1, lostReasons: [{ reason: 'Fiyat yüksek', count: 1 }] });
  });

  it('saves referral settings merged with the defaults', async () => {
    expect(await as(() => service.referralSettings())).toMatchObject({ enabled: false });
    expect(await as(() => service.saveReferralSettings({ enabled: true, rewardAmount: 100 }))).toEqual({
      enabled: true,
      rewardType: 'wallet',
      rewardAmount: 100,
      rewardDays: 0,
    });
    expect(await as(() => service.referralSettings())).toMatchObject({ enabled: true, rewardAmount: 100 });
  });
});
