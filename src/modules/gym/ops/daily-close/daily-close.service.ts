import { Injectable } from '@nestjs/common';
import { ErrorCode } from '../../../../shared/errors/error-codes';
import { TENANT_COLLECTION } from '../../../../shared/firebase/firestore-path';
import { BaseDocument } from '../../../../shared/firestore/base-document';
import { GymStore } from '../../shared/gym-store';
import {
  GymDailyClosing,
  IncomeSummaryDto,
  ExpenseSummaryDto,
  PreClosePreviewResponse,
  SubmitDailyCloseDto,
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
  constructor(private readonly store: GymStore) {}

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

    return {
      date: targetDate,
      branchId,
      openingCash: Math.round(openingCash * 100) / 100,
      incomeSummary,
      expenseSummary,
      expectedCash,
      expectedPos,
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
    const actualPos = dto.actualPosCounted !== undefined && dto.actualPosCounted !== null
      ? Number(dto.actualPosCounted)
      : preview.expectedPos;

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
      retainedCashForNextDay: retained,
      bankDepositAmount: bankDeposit,
      notes: dto.notes?.trim() || '',
      status: 'closed',
      closedAt: nowIso,
    };

    if (preview.existingClosing?.id) {
      await this.store.update(
        DAILY_CLOSINGS_COLLECTION,
        preview.existingClosing.id,
        ErrorCode.GYM_ACCOUNTING_NOT_FOUND,
        'Closing not found',
        payload as Record<string, unknown>,
      );
      return {
        ...preview.existingClosing,
        ...payload,
      };
    }

    const created = await this.store.create(DAILY_CLOSINGS_COLLECTION, payload as Record<string, unknown>);
    return created as unknown as GymDailyClosing;
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
}
