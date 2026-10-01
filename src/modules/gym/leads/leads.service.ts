import { Injectable } from '@nestjs/common';
import { Transaction } from 'firebase-admin/firestore';
import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { TENANT_COLLECTION } from '../../../shared/firebase/firestore-path';
import { BaseDocument, createBaseFields, isDeleted, touchBaseFields } from '../../../shared/firestore/base-document';
import { GymMember } from '../members/member.entity';
import { GymStore } from '../shared/gym-store';
import { ConvertLeadDto, FunnelQueryDto, LeadStageDto, RecordReferralDto, ReferralSettingsDto } from './leads.dto';
import {
  funnelReport,
  LeadRecord,
  mergeReferralSettings,
  ReferralSettings,
  referralReward,
  rewardId,
  stageChange,
} from './leads.rules';

type Lead = BaseDocument & LeadRecord & Record<string, unknown>;

export interface ReferralReward extends BaseDocument {
  tenantId: string;
  referrerMemberId: string;
  referrerName: string;
  referredMemberId: string;
  referredName: string;
  leadId: string | null;
  type: 'wallet' | 'days';
  amount: number | null;
  days: number | null;
  status: 'granted' | 'pending';
  note: string | null;
}

const LEADS = TENANT_COLLECTION.gymGuestMembers;

/**
 * Lead funnel on top of the guest-member records (stage history, conversion to a member) and the
 * referral programme: when a member brought by another member signs up, the referrer gets the
 * configured reward exactly once (the reward document id is derived from the new member, written
 * with `create()` in the same transaction as the wallet or membership change).
 */
@Injectable()
export class GymLeadsService {
  constructor(private readonly store: GymStore) {}

  async funnel(query: FunnelQueryDto) {
    const leads = await this.store.list<Lead>(LEADS);
    return funnelReport(leads, query);
  }

  async changeStage(id: string, dto: LeadStageDto) {
    if (dto.stage === 'converted') {
      throw new AppException(ErrorCode.VALIDATION_ERROR, 'Use the convert endpoint with the new member');
    }
    const lead = await this.store.getOrThrow<Lead>(LEADS, id, ErrorCode.GYM_GUEST_NOT_FOUND, 'Guest not found');
    const patch = stageChange(lead, dto.stage, this.store.userId());
    if (dto.stage === 'lost') patch.lostReason = dto.lostReason?.trim() || null;
    if (!Object.keys(patch).length) return lead;
    return this.store.update<Lead>(LEADS, id, ErrorCode.GYM_GUEST_NOT_FOUND, 'Guest not found', patch);
  }

  /**
   * Marks the lead as converted into `memberId`, links the member to the lead (and its referrer)
   * and rewards the referrer. Calling it again for the same member changes nothing.
   */
  async convert(id: string, dto: ConvertLeadDto) {
    const settings = await this.referralSettings();
    const userId = this.store.userId();
    return this.transaction(async (tx) => {
      const leadRef = this.ref(LEADS, id);
      const lead = this.alive<Lead>(await tx.get(leadRef));
      if (!lead) throw new AppException(ErrorCode.GYM_GUEST_NOT_FOUND, 'Guest not found');
      if (lead.convertedMemberId && lead.convertedMemberId !== dto.memberId) {
        throw new AppException(ErrorCode.VALIDATION_ERROR, 'Lead is already converted to another member');
      }
      const referrerId = lead.referrerMemberId && lead.referrerMemberId !== dto.memberId ? lead.referrerMemberId : null;
      const [member, referrer] = await this.readMembers(tx, dto.memberId, referrerId);
      if (!member) throw new AppException(ErrorCode.GYM_MEMBER_NOT_FOUND, 'Member not found');
      const rewardRef = this.ref(TENANT_COLLECTION.gymReferralRewards, rewardId(dto.memberId));
      const rewarded = (await tx.get(rewardRef)).exists;

      tx.update(leadRef, {
        ...stageChange(lead, 'converted', userId),
        convertedMemberId: dto.memberId,
        ...touchBaseFields(userId),
      });
      tx.update(this.ref(TENANT_COLLECTION.gymMembers, dto.memberId), {
        leadId: lead.id,
        leadSource: lead.source ?? null,
        ...(referrer ? { referredByMemberId: referrer.uid, referredByName: referrer.displayName } : {}),
        ...touchBaseFields(userId),
      });
      const reward = referrer && !rewarded ? this.grantReward(tx, settings, referrer, member, lead.id) : null;
      return { leadId: lead.id, memberId: dto.memberId, referrerMemberId: referrer?.uid ?? null, reward };
    });
  }

  /** Records that an existing member brought a new member who signed up without a lead record. */
  async recordReferral(dto: RecordReferralDto) {
    if (dto.referrerMemberId === dto.memberId) {
      throw new AppException(ErrorCode.VALIDATION_ERROR, 'A member cannot refer themselves');
    }
    const settings = await this.referralSettings();
    const userId = this.store.userId();
    return this.transaction(async (tx) => {
      const [member, referrer] = await this.readMembers(tx, dto.memberId, dto.referrerMemberId);
      if (!member || !referrer) throw new AppException(ErrorCode.GYM_MEMBER_NOT_FOUND, 'Member not found');
      const previous = (member as GymMember & { referredByMemberId?: string }).referredByMemberId;
      if (previous && previous !== referrer.uid) {
        throw new AppException(ErrorCode.VALIDATION_ERROR, 'Member is already linked to another referrer');
      }
      const rewardRef = this.ref(TENANT_COLLECTION.gymReferralRewards, rewardId(dto.memberId));
      const rewarded = (await tx.get(rewardRef)).exists;
      tx.update(this.ref(TENANT_COLLECTION.gymMembers, member.uid), {
        referredByMemberId: referrer.uid,
        referredByName: referrer.displayName,
        ...touchBaseFields(userId),
      });
      const reward = rewarded ? null : this.grantReward(tx, settings, referrer, member, null);
      return { memberId: member.uid, referrerMemberId: referrer.uid, reward };
    });
  }

  async referralSettings(): Promise<ReferralSettings> {
    const stored = await this.store.getSingleton<BaseDocument & Partial<ReferralSettings>>(TENANT_COLLECTION.gymReferralSettings);
    return mergeReferralSettings(stored);
  }

  async saveReferralSettings(dto: ReferralSettingsDto): Promise<ReferralSettings> {
    const next = mergeReferralSettings({ ...(await this.referralSettings()), ...dto });
    await this.store.upsertSingleton(TENANT_COLLECTION.gymReferralSettings, next);
    return next;
  }

  /** Rewards (newest first) with a per-referrer summary for the staff screen. */
  async rewards() {
    const items = await this.store.list<ReferralReward>(TENANT_COLLECTION.gymReferralRewards);
    const byReferrer = new Map<string, { referrerMemberId: string; referrerName: string; referrals: number; walletTotal: number; days: number }>();
    for (const item of items) {
      const row = byReferrer.get(item.referrerMemberId) ?? {
        referrerMemberId: item.referrerMemberId,
        referrerName: item.referrerName,
        referrals: 0,
        walletTotal: 0,
        days: 0,
      };
      row.referrals += 1;
      if (item.status === 'granted' && item.type === 'wallet') row.walletTotal = Math.round((row.walletTotal + (item.amount ?? 0)) * 100) / 100;
      if (item.status === 'granted' && item.type === 'days') row.days += item.days ?? 0;
      byReferrer.set(item.referrerMemberId, row);
    }
    return { items, referrers: [...byReferrer.values()].sort((a, b) => b.referrals - a.referrals) };
  }

  /** Member app: the programme and the member's own referrals. */
  async memberSummary(userId: string) {
    const settings = await this.referralSettings();
    const mine = (await this.store.collection(TENANT_COLLECTION.gymReferralRewards).where('referrerMemberId', '==', userId).get()).docs
      .map((doc) => doc.data() as ReferralReward)
      .filter((item) => !isDeleted(item))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return {
      program: settings.enabled
        ? { enabled: true, rewardType: settings.rewardType, rewardAmount: settings.rewardAmount, rewardDays: settings.rewardDays }
        : { enabled: false },
      referrals: mine.map((item) => ({
        referredName: item.referredName,
        createdAt: item.createdAt,
        status: item.status,
        type: item.type,
        amount: item.amount,
        days: item.days,
      })),
    };
  }

  // ─── Transaction steps ───────────────────────────────────────────────────────────────────

  /** Writes the reward (if the programme gives one) and tells the referrer in the member app. */
  private grantReward(tx: Transaction, settings: ReferralSettings, referrer: GymMember, member: GymMember, leadId: string | null) {
    const outcome = referralReward(settings, referrer);
    if (!outcome) return null;
    const userId = this.store.userId();
    const id = rewardId(member.uid);
    const referrerRef = this.ref(TENANT_COLLECTION.gymMembers, referrer.uid);
    if (outcome.status === 'granted' && outcome.type === 'wallet') {
      tx.update(referrerRef, { walletBalance: outcome.walletBalance, ...touchBaseFields(userId) });
      const walletRef = this.store.collection(TENANT_COLLECTION.gymWalletTx).doc();
      tx.set(walletRef, {
        ...this.baseFields(walletRef.id),
        userId: referrer.uid,
        type: 'deposit',
        amount: outcome.amount,
        description: `Tavsiye ödülü: ${member.displayName}`,
        referenceId: id,
        referenceType: 'referral',
        status: 'completed',
        paymentMethod: 'referral',
        notes: '',
      });
    }
    if (outcome.status === 'granted' && outcome.type === 'days') {
      tx.update(referrerRef, { membershipEndsAt: outcome.membershipEndsAt, ...touchBaseFields(userId) });
    }
    const reward: ReferralReward = {
      ...this.baseFields(id),
      referrerMemberId: referrer.uid,
      referrerName: referrer.displayName,
      referredMemberId: member.uid,
      referredName: member.displayName,
      leadId,
      type: outcome.type,
      amount: outcome.type === 'wallet' ? outcome.amount : null,
      days: outcome.type === 'days' ? outcome.days : null,
      status: outcome.status,
      note: outcome.status === 'pending' ? outcome.reason : null,
    };
    tx.create(this.ref(TENANT_COLLECTION.gymReferralRewards, id), reward);
    if (outcome.status === 'granted') {
      const notification = this.store.collection(TENANT_COLLECTION.gymMemberNotifications).doc();
      tx.set(notification, {
        ...this.baseFields(notification.id),
        userId: referrer.uid,
        type: 'referral_reward',
        title: 'Tavsiye ödülün tanımlandı',
        body:
          outcome.type === 'wallet'
            ? `${member.displayName} aramıza katıldı. Cüzdanına ${outcome.amount} TL eklendi.`
            : `${member.displayName} aramıza katıldı. Üyeliğine ${outcome.days} gün eklendi.`,
        readAt: null,
      });
    }
    return reward;
  }

  private async readMembers(tx: Transaction, memberId: string, referrerId: string | null) {
    const refs = [memberId, ...(referrerId ? [referrerId] : [])].map((uid) => this.ref(TENANT_COLLECTION.gymMembers, uid));
    const snapshots = await tx.getAll(...refs);
    const members = snapshots.map((snapshot) => {
      const member = this.alive<GymMember>(snapshot);
      return member ? { ...member, uid: member.uid ?? snapshot.id } : null;
    });
    return [members[0], referrerId ? members[1] : null] as const;
  }

  private alive<T extends { deletedAt?: string | null }>(snapshot: { exists: boolean; data(): unknown }): T | null {
    const item = snapshot.exists ? (snapshot.data() as T) : null;
    return item && !isDeleted(item) ? item : null;
  }

  private transaction<T>(run: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.store.collection(LEADS).firestore.runTransaction(run);
  }

  private ref(collection: string, id: string) {
    return this.store.collection(collection).doc(id);
  }

  private baseFields(id: string) {
    return { ...createBaseFields(id, this.store.userId()), tenantId: this.store.tenantId() };
  }
}
