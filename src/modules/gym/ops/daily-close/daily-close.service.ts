import { Injectable, Logger } from '@nestjs/common';
import { ErrorCode } from '../../../../shared/errors/error-codes';
import { TENANT_COLLECTION, ROOT_COLLECTION, tenantCollectionPath } from '../../../../shared/firebase/firestore-path';
import { FirebaseService } from '../../../../shared/firebase/firebase.service';
import { MailService } from '../../../../shared/mail/mail.service';
import { GymStaff } from '../../staff/staff.entity';
import { TenantNotificationDoc } from '../../../platform/crm/crm-notifications.service';
import { isDeleted } from '../../../../shared/firestore/base-document';
import { BaseDocument } from '../../../../shared/firestore/base-document';
import { GymStore } from '../../shared/gym-store';
import {
  GymDailyClosing,
  IncomeSummaryDto,
  ExpenseSummaryDto,
  PreClosePreviewResponse,
  SubmitDailyCloseDto,
  DailyCloseReminderSettings,
  UpdateDailyCloseReminderSettingsDto,
} from './daily-close.dto';

const DAILY_CLOSINGS_COLLECTION = 'gymDailyClosings';
type Doc = BaseDocument & Record<string, unknown>;

function toDateKey(val: unknown): string {
  if (!val) return '';
  if (typeof val === 'string') return val.slice(0, 10);
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  if (typeof val === 'object') {
    const anyVal = val as Record<string, unknown>;
    if (typeof anyVal.toDate === 'function') {
      return (anyVal.toDate() as Date).toISOString().slice(0, 10);
    }
    if (typeof anyVal._seconds === 'number') {
      return new Date(anyVal._seconds * 1000).toISOString().slice(0, 10);
    }
    if (typeof anyVal.seconds === 'number') {
      return new Date(anyVal.seconds * 1000).toISOString().slice(0, 10);
    }
  }
  return '';
}

function normalizePaymentMethod(method?: string): 'cash' | 'posCard' | 'bankTransfer' | 'wallet' | 'other' {
  if (!method) return 'cash';
  const m = String(method).toLowerCase().trim();
  if (m === 'cash' || m === 'nakit') return 'cash';
  if (m.includes('card') || m.includes('pos') || m.includes('kart') || m === 'creditcard') return 'posCard';
  if (m.includes('transfer') || m.includes('havale') || m.includes('eft') || m.includes('bank')) return 'bankTransfer';
  if (m.includes('wallet') || m.includes('cüzdan') || m === 'cuzdan') return 'wallet';
  return 'other';
}

@Injectable()
export class GymDailyCloseService {
  private readonly logger = new Logger(GymDailyCloseService.name);

  constructor(
    private readonly store: GymStore,
    private readonly firebase: FirebaseService,
    private readonly mailService: MailService,
  ) {}

  async getPreClosePreview(dateStr?: string, branchId?: string): Promise<PreClosePreviewResponse> {
    const targetDate = dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)
      ? dateStr
      : new Date().toISOString().slice(0, 10);

    // 1. Check existing closing for this date
    const allClosings = await this.store.list<GymDailyClosing>(DAILY_CLOSINGS_COLLECTION);
    const existingClosing = allClosings.find((c) => {
      const matchDate = c.date === targetDate;
      const matchBranch = branchId ? c.branchId === branchId : true;
      return matchDate && matchBranch;
    });

    // 2. Determine openingCash from the most recent closing before targetDate
    let openingCash = 0;
    const priorClosings = allClosings
      .filter((c) => c.date < targetDate && (branchId ? c.branchId === branchId : true))
      .sort((a, b) => b.date.localeCompare(a.date));

    if (priorClosings.length > 0) {
      const last = priorClosings[0];
      openingCash = Number(last.retainedCashForNextDay ?? last.actualCashCounted ?? 0);
    }

    // 3. Query all accounting entries for targetDate
    const entries = await this.store.list<Doc>(TENANT_COLLECTION.gymAccountingEntries);

    const dayEntries = entries.filter((e) => {
      const eDate = toDateKey(e['entryDate'] || e['createdAt']);
      if (eDate !== targetDate) return false;
      if (branchId && e['branchId'] && e['branchId'] !== branchId) return false;
      return true;
    });

    const incomeSummary: IncomeSummaryDto = {
      cash: 0,
      posCard: 0,
      bankTransfer: 0,
      wallet: 0,
      total: 0,
      packageSaleCount: 0,
      shopSaleCount: 0,
      receivableCollectionCount: 0,
      totalTransactionCount: 0,
    };

    const expenseSummary: ExpenseSummaryDto = {
      cash: 0,
      bank: 0,
      total: 0,
      count: 0,
    };

    for (const entry of dayEntries) {
      const amount = Number(entry['amount'] ?? 0);
      if (isNaN(amount) || amount <= 0) continue;

      const type = String(entry['type'] ?? 'income').toLowerCase();
      const method = normalizePaymentMethod(String(entry['paymentMethod'] ?? 'cash'));
      const refType = String(entry['referenceType'] ?? '').toLowerCase();

      if (type === 'expense') {
        if (method === 'cash') {
          expenseSummary.cash += amount;
        } else {
          expenseSummary.bank += amount;
        }
        expenseSummary.total += amount;
        expenseSummary.count++;
      } else {
        // Income
        if (method === 'cash') {
          incomeSummary.cash += amount;
        } else if (method === 'posCard') {
          incomeSummary.posCard += amount;
        } else if (method === 'bankTransfer') {
          incomeSummary.bankTransfer += amount;
        } else if (method === 'wallet') {
          incomeSummary.wallet += amount;
        } else {
          incomeSummary.cash += amount;
        }

        if (refType === 'membership') {
          incomeSummary.packageSaleCount++;
        } else if (refType === 'product-sale' || refType === 'product') {
          incomeSummary.shopSaleCount++;
        } else if (refType === 'receivable' || refType === 'installment' || refType === 'debt') {
          incomeSummary.receivableCollectionCount++;
        }

        incomeSummary.total += amount;
        incomeSummary.totalTransactionCount++;
      }
    }

    // Round values to 2 decimals
    incomeSummary.cash = Math.round(incomeSummary.cash * 100) / 100;
    incomeSummary.posCard = Math.round(incomeSummary.posCard * 100) / 100;
    incomeSummary.bankTransfer = Math.round(incomeSummary.bankTransfer * 100) / 100;
    incomeSummary.wallet = Math.round(incomeSummary.wallet * 100) / 100;
    incomeSummary.total = Math.round(incomeSummary.total * 100) / 100;

    expenseSummary.cash = Math.round(expenseSummary.cash * 100) / 100;
    expenseSummary.bank = Math.round(expenseSummary.bank * 100) / 100;
    expenseSummary.total = Math.round(expenseSummary.total * 100) / 100;

    const expectedCash = Math.round((openingCash + incomeSummary.cash - expenseSummary.cash) * 100) / 100;
    const expectedPos = Math.round(incomeSummary.posCard * 100) / 100;

    // 4. Query active banks with POS for separate per-bank closing
    let bankPosExpected: Array<{ bankId: string; bankName: string; terminalNo?: string; expectedPos: number }> = [];
    try {
      const banks = await this.store.list<Doc>(TENANT_COLLECTION.gymBanks);
      const activePosBanks = (banks || []).filter((b) => b['status'] !== 'inactive' && b['hasPos'] !== false);

      bankPosExpected = activePosBanks.map((b) => {
        const bankId = String(b.id || '');
        const bankName = String(b['bankName'] || 'Banka');
        const terminalNo = String(b['posTerminalNo'] || '');

        let matchedAmount = 0;
        for (const e of dayEntries) {
          if (e['bankId'] === bankId || e['bankName'] === bankName) {
            matchedAmount += Number(e['amount'] || 0);
          }
        }
        return {
          bankId,
          bankName,
          terminalNo,
          expectedPos: Math.round(matchedAmount * 100) / 100,
        };
      });
    } catch {
      bankPosExpected = [];
    }

    return {
      date: targetDate,
      branchId,
      openingCash: Math.round(openingCash * 100) / 100,
      incomeSummary,
      expenseSummary,
      expectedCash,
      expectedPos,
      bankPosExpected,
      isAlreadyClosed: Boolean(existingClosing && existingClosing.status === 'closed'),
      existingClosing,
    };
  }

  async submitDailyClose(
    dto: SubmitDailyCloseDto,
    staffUser?: { id?: string; name?: string },
  ): Promise<GymDailyClosing> {
    const preview = await this.getPreClosePreview(dto.date, dto.branchId);

    const actualCash = Number(dto.actualCashCounted ?? 0);
    let actualPos = dto.actualPosCounted !== undefined && dto.actualPosCounted !== null
      ? Number(dto.actualPosCounted)
      : preview.expectedPos;

    if (dto.bankPosClosings && dto.bankPosClosings.length > 0) {
      actualPos = dto.bankPosClosings.reduce((sum, b) => sum + Number(b.actualPos || 0), 0);
      actualPos = Math.round(actualPos * 100) / 100;
    }

    const cashDiff = Math.round((actualCash - preview.expectedCash) * 100) / 100;
    const posDiff = Math.round((actualPos - preview.expectedPos) * 100) / 100;

    const retained = dto.retainedCashForNextDay !== undefined && dto.retainedCashForNextDay !== null
      ? Number(dto.retainedCashForNextDay)
      : actualCash;

    const bankDeposit = dto.bankDepositAmount !== undefined && dto.bankDepositAmount !== null
      ? Number(dto.bankDepositAmount)
      : Math.max(0, Math.round((actualCash - retained) * 100) / 100);

    // Generate Z sequence number
    const allClosings = await this.store.list<GymDailyClosing>(DAILY_CLOSINGS_COLLECTION);
    const closingsOnDate = allClosings.filter((c) => c.date === preview.date);
    const seq = (closingsOnDate.length + 1).toString().padStart(3, '0');
    const cleanDate = preview.date.replace(/-/g, '');
    const closingNumber = `Z-${cleanDate}-${seq}`;

    const nowIso = new Date().toISOString();
    const payload: Omit<GymDailyClosing, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy' | 'deletedAt'> = {
      closingNumber,
      date: preview.date,
      branchId: dto.branchId,
      branchName: dto.branchName,
      closedByStaffId: staffUser?.id || 'admin',
      closedByStaffName: staffUser?.name || 'Yönetici / Kasa Görevlisi',
      openingCash: preview.openingCash,
      incomeSummary: preview.incomeSummary,
      expenseSummary: preview.expenseSummary,
      expectedCash: preview.expectedCash,
      actualCashCounted: actualCash,
      cashDifference: cashDiff,
      expectedPos: preview.expectedPos,
      actualPosCounted: actualPos,
      posDifference: posDiff,
      bankPosClosings: dto.bankPosClosings || [],
      retainedCashForNextDay: retained,
      bankDepositAmount: bankDeposit,
      notes: dto.notes?.trim() || '',
      status: 'closed',
      closedAt: nowIso,
    };

    let finalClosing: GymDailyClosing;
    if (preview.existingClosing?.id) {
      await this.store.update(
        DAILY_CLOSINGS_COLLECTION,
        preview.existingClosing.id,
        ErrorCode.GYM_ACCOUNTING_NOT_FOUND,
        'Closing not found',
        payload as Record<string, unknown>,
      );
      finalClosing = {
        ...preview.existingClosing,
        ...payload,
      };
    } else {
      const created = await this.store.create(DAILY_CLOSINGS_COLLECTION, payload as Record<string, unknown>);
      finalClosing = created as unknown as GymDailyClosing;
    }

    // 5. Patron (owner) personellere bildirim ve e-posta gönder
    try {
      await this.notifyOwnersOnDailyClose(finalClosing);
    } catch (err) {
      this.logger.error(`Gün sonu patron bildirimleri gönderilirken hata oluştu: ${(err as Error).message}`);
    }

    return finalClosing;
  }

  async listClosings(branchId?: string, limit = 50): Promise<GymDailyClosing[]> {
    const list = await this.store.list<GymDailyClosing>(DAILY_CLOSINGS_COLLECTION);
    return list
      .filter((c) => (branchId ? c.branchId === branchId : true))
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      .slice(0, limit);
  }

  async getClosingById(id: string): Promise<GymDailyClosing> {
    const doc = await this.store.getOrThrow<GymDailyClosing>(
      DAILY_CLOSINGS_COLLECTION,
      id,
      ErrorCode.GYM_ACCOUNTING_NOT_FOUND,
      'Gün sonu kapanış kaydı bulunamadı',
    );
    return doc;
  }

  async verifyClosing(
    id: string,
    staffUser?: { id?: string; name?: string },
  ): Promise<GymDailyClosing> {
    const existing = await this.getClosingById(id);
    const updatePayload = {
      status: 'verified' as const,
      verifiedByStaffId: staffUser?.id || 'manager',
      verifiedByStaffName: staffUser?.name || 'Salon Müdürü',
      verifiedAt: new Date().toISOString(),
    };
    await this.store.update(
      DAILY_CLOSINGS_COLLECTION,
      id,
      ErrorCode.GYM_ACCOUNTING_NOT_FOUND,
      'Gün sonu kaydı bulunamadı',
      updatePayload,
    );
    return {
      ...existing,
      ...updatePayload,
    };
  }

  async getReminderSettings(): Promise<DailyCloseReminderSettings> {
    const list = await this.store.list<DailyCloseReminderSettings>(TENANT_COLLECTION.gymDailyCloseSettings);
    if (list && list.length > 0) {
      return list[0];
    }
    return {
      id: 'default',
      enabled: true,
      reminderTime: '22:00',
      days: ['0', '1', '2', '3', '4', '5', '6'],
      notifyInApp: true,
    } as unknown as DailyCloseReminderSettings;
  }

  async updateReminderSettings(dto: UpdateDailyCloseReminderSettingsDto): Promise<DailyCloseReminderSettings> {
    const list = await this.store.list<DailyCloseReminderSettings>(TENANT_COLLECTION.gymDailyCloseSettings);
    const payload = {
      enabled: Boolean(dto.enabled),
      reminderTime: dto.reminderTime || '22:00',
      days: dto.days || ['0', '1', '2', '3', '4', '5', '6'],
      notifyInApp: dto.notifyInApp !== undefined ? Boolean(dto.notifyInApp) : true,
    };

    if (list && list.length > 0) {
      await this.store.update(
        TENANT_COLLECTION.gymDailyCloseSettings,
        list[0].id,
        ErrorCode.GYM_ACCOUNTING_NOT_FOUND,
        'Ayarlar güncellenemedi',
        payload,
      );
      return {
        ...list[0],
        ...payload,
      };
    }

    const created = await this.store.create(TENANT_COLLECTION.gymDailyCloseSettings, payload);
    return created as unknown as DailyCloseReminderSettings;
  }

  private async notifyOwnersOnDailyClose(closing: GymDailyClosing): Promise<void> {
    const tenantId = this.store.tenantId();

    // 1. Kulüp adını al
    let gymName = 'OdivonGYM';
    try {
      const gymInfos = await this.store.list<Doc & { gymName?: string; name?: string }>(TENANT_COLLECTION.gymInfo);
      if (gymInfos.length > 0) {
        gymName = gymInfos[0].gymName || gymInfos[0].name || gymName;
      }
    } catch {
      // yoksay
    }

    // 2. Personel Tanımlarında rolü "Patron" (owner) olan aktif personelleri çek
    const allStaff = await this.store.list<GymStaff>(TENANT_COLLECTION.gymStaff);
    const patronStaff = allStaff.filter(
      (s) => s.role === 'owner' && s.status !== 'inactive' && !isDeleted(s as unknown as Record<string, unknown>),
    );

    // 3. users koleksiyonundaki işletme sahibi kullanıcıları al
    let ownerUsers: Array<{ id: string; email: string; displayName: string }> = [];
    try {
      const usersSnap = await this.firebase.db
        .collection(ROOT_COLLECTION.users)
        .where('tenantId', '==', tenantId)
        .where('role', '==', 'owner')
        .get();
      ownerUsers = usersSnap.docs.map((d) => ({
        id: d.id,
        email: String(d.data()['email'] || '').trim().toLowerCase(),
        displayName: String(d.data()['displayName'] || d.data()['email'] || 'Salon Sahibi').trim(),
      }));
    } catch (e) {
      this.logger.warn(`İşletme sahibi kullanıcıları sorgulanamadı: ${(e as Error).message}`);
    }

    // 4. Tekilleştirilmiş Patron alıcı listesi oluştur
    interface OwnerContact {
      uid?: string;
      email: string;
      displayName: string;
    }
    const recipientsMap = new Map<string, OwnerContact>();

    // Personel Tanımları (gymStaff)
    for (const staff of patronStaff) {
      const email = (staff.email || '').trim().toLowerCase();
      const key = email || staff.userId || staff.id;
      if (!key) continue;
      recipientsMap.set(key, {
        uid: staff.userId || undefined,
        email,
        displayName: staff.displayName?.trim() || 'Salon Sahibi / Ortak',
      });
    }

    // Kullanıcılar (users koleksiyonu)
    for (const u of ownerUsers) {
      const key = u.email || u.id;
      if (!recipientsMap.has(key)) {
        recipientsMap.set(key, {
          uid: u.id,
          email: u.email,
          displayName: u.displayName,
        });
      } else {
        const existing = recipientsMap.get(key)!;
        if (!existing.uid) existing.uid = u.id;
      }
    }

    const recipients = Array.from(recipientsMap.values());
    const targetUids = recipients.map((r) => r.uid).filter(Boolean) as string[];

    // 5. In-App Bildirim (platformNotifications) -> Çan simgesi & Bildirim Merkezi için
    try {
      const notifRef = this.firebase.db
        .collection(tenantCollectionPath(tenantId, 'platformNotifications'))
        .doc();

      const cashDiff = Number(closing.cashDifference || 0);
      let diffText = 'Kasa Tam (Fark Yok)';
      if (cashDiff < 0) {
        diffText = `Kasa Eksiği: ${cashDiff.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺`;
      } else if (cashDiff > 0) {
        diffText = `Kasa Fazlası: +${cashDiff.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺`;
      }

      const notifDoc: TenantNotificationDoc = {
        id: notifRef.id,
        broadcastId: `daily_close_${closing.id || notifRef.id}`,
        campaignId: null,
        title: `Gün Sonu Kapanışı (Z Raporu): ${closing.closingNumber}`,
        body: `${closing.date} tarihli kasa gün sonu ${closing.closedByStaffName} tarafından tamamlandı. Sayılan Nakit: ${Number(closing.actualCashCounted || 0).toLocaleString('tr-TR')} ₺ | Fiziki POS: ${Number(closing.actualPosCounted || 0).toLocaleString('tr-TR')} ₺. ${diffText}.`,
        level: cashDiff !== 0 ? 'warning' : 'success',
        link: '/admin/accounting?tab=daily-close',
        linkLabel: 'Z Raporunu İncele',
        createdAt: new Date().toISOString(),
        expiresAt: null,
        readBy: [],
        deletedAt: null,
        targetRoles: ['owner'],
        targetUids: targetUids.length > 0 ? targetUids : undefined,
        category: 'accounting',
      };

      await notifRef.set(notifDoc);
      this.logger.log(`Gün sonu patron içi platform bildirimi kaydedildi: ${notifRef.id}`);
    } catch (notifErr) {
      this.logger.error(`Gün sonu platform bildirimi kaydedilemedi: ${(notifErr as Error).message}`);
    }

    // 6. Patronlara Gün Sonu Özet E-postası Gönder
    for (const recipient of recipients) {
      if (recipient.email && recipient.email.includes('@')) {
        this.mailService.sendDailyCloseEmail({
          to: recipient.email,
          recipientName: recipient.displayName,
          closingNumber: closing.closingNumber,
          date: closing.date,
          closedByStaffName: closing.closedByStaffName,
          openingCash: closing.openingCash,
          actualCashCounted: closing.actualCashCounted,
          expectedCash: closing.expectedCash,
          cashDifference: closing.cashDifference,
          actualPosCounted: closing.actualPosCounted,
          expectedPos: closing.expectedPos,
          posDifference: closing.posDifference,
          retainedCashForNextDay: closing.retainedCashForNextDay,
          bankDepositAmount: closing.bankDepositAmount,
          notes: closing.notes,
          branchName: closing.branchName,
          gymName,
        }).catch((err) => {
          this.logger.warn(`Gün sonu e-postası iletilemedi (${recipient.email}): ${(err as Error).message}`);
        });
      }
    }
  }
}
