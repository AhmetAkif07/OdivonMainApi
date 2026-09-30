import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { TENANT_COLLECTION } from '../../../shared/firebase/firestore-path';
import { BaseDocument } from '../../../shared/firestore/base-document';
import { paginateInMemory } from '../../../shared/http/paginate-memory';
import { AccessSyncService } from '../access/access-sync.service';
import { MembersRepository } from '../members/members.repository';
import { PackagesRepository } from '../packages/packages.repository';
import { GymStore } from '../shared/gym-store';
import { applyPackage } from '../shared/membership';
import { GymCommerceService } from './commerce.service';
import {
  CancelReceivableDto,
  CreateInstallmentSaleDto,
  ListReceivablesQueryDto,
  ReceivablePaymentDto,
  ReceivablePaymentMethod,
  ReceivableStatus,
} from './receivables.dto';
import {
  addMonths,
  allocatePayment,
  buildSchedule,
  gymToday,
  Installment,
  isIsoDate,
  planStanding,
  PlanStanding,
  remainingOf,
  toKurus,
  toTl,
} from './receivables.math';

export interface ReceivablePayment {
  id: string;
  kind: 'down_payment' | 'installment';
  amount: number;
  paymentMethod: ReceivablePaymentMethod;
  paidAt: string;
  recordedBy: string;
  note: string | null;
}

export interface GymReceivable extends BaseDocument {
  tenantId: string;
  userId: string;
  memberName: string;
  memberNumber: string | null;
  memberPhone: string | null;
  packageId: string;
  packageName: string;
  listPrice: number;
  discount: number;
  totalAmount: number;
  downPayment: number;
  financedAmount: number;
  installmentCount: number;
  installments: Installment[];
  payments: ReceivablePayment[];
  paidAmount: number;
  remainingAmount: number;
  status: ReceivableStatus;
  saleDate: string;
  notes: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
}

export type ReceivableView = Omit<GymReceivable, 'installments'> & PlanStanding;

export interface DebtorRow {
  userId: string;
  memberName: string;
  memberNumber: string | null;
  memberPhone: string | null;
  openPlans: number;
  totalDebt: number;
  overdueAmount: number;
  overdueCount: number;
  maxDaysLate: number;
  nextDueDate: string | null;
  nextDueAmount: number;
}

export interface OverdueRow {
  receivableId: string;
  userId: string;
  memberName: string;
  memberPhone: string | null;
  packageName: string;
  installmentNo: number;
  installmentCount: number;
  dueDate: string;
  amount: number;
  remainingAmount: number;
  daysLate: number;
}

const COLLECTION = TENANT_COLLECTION.gymReceivables;

@Injectable()
export class GymReceivablesService {
  constructor(
    private readonly store: GymStore,
    private readonly members: MembersRepository,
    private readonly packages: PackagesRepository,
    private readonly accessSync: AccessSyncService,
    private readonly commerce: GymCommerceService,
  ) {}

  async list(query: ListReceivablesQueryDto) {
    const today = gymToday();
    const items = (await this.store.list<GymReceivable>(COLLECTION))
      .filter((item) => !query.userId || item.userId === query.userId)
      .filter((item) => !query.status || item.status === query.status)
      .map((item) => toView(item, today));
    return paginateInMemory(items, query.limit ?? 100, query.cursor);
  }

  async get(id: string): Promise<ReceivableView> {
    return toView(await this.getOrThrow(id), gymToday());
  }

  /** Per-member debt: every member with an open plan, most overdue first. */
  async debtors(): Promise<DebtorRow[]> {
    const today = gymToday();
    const rows = new Map<string, DebtorRow>();
    for (const plan of await this.openPlans()) {
      const standing = planStanding(plan.installments, today);
      const row = rows.get(plan.userId) ?? {
        userId: plan.userId,
        memberName: plan.memberName,
        memberNumber: plan.memberNumber,
        memberPhone: plan.memberPhone,
        openPlans: 0,
        totalDebt: 0,
        overdueAmount: 0,
        overdueCount: 0,
        maxDaysLate: 0,
        nextDueDate: null,
        nextDueAmount: 0,
      };
      row.openPlans += 1;
      row.totalDebt = toTl(toKurus(row.totalDebt) + toKurus(standing.remainingAmount));
      row.overdueAmount = toTl(toKurus(row.overdueAmount) + toKurus(standing.overdueAmount));
      row.overdueCount += standing.overdueCount;
      row.maxDaysLate = Math.max(row.maxDaysLate, standing.maxDaysLate);
      if (standing.nextDueDate && (!row.nextDueDate || standing.nextDueDate < row.nextDueDate)) {
        row.nextDueDate = standing.nextDueDate;
        row.nextDueAmount = standing.nextDueAmount;
      } else if (standing.nextDueDate && standing.nextDueDate === row.nextDueDate) {
        row.nextDueAmount = toTl(toKurus(row.nextDueAmount) + toKurus(standing.nextDueAmount));
      }
      rows.set(plan.userId, row);
    }
    return [...rows.values()].sort(
      (a, b) =>
        b.maxDaysLate - a.maxDaysLate ||
        b.overdueAmount - a.overdueAmount ||
        (a.nextDueDate ?? '9999').localeCompare(b.nextDueDate ?? '9999'),
    );
  }

  /** Every unpaid installment whose due date has passed, latest first. */
  async overdue(): Promise<OverdueRow[]> {
    const today = gymToday();
    const rows: OverdueRow[] = [];
    for (const plan of await this.openPlans()) {
      for (const item of planStanding(plan.installments, today).installments) {
        if (!item.overdue) continue;
        rows.push({
          receivableId: plan.id,
          userId: plan.userId,
          memberName: plan.memberName,
          memberPhone: plan.memberPhone,
          packageName: plan.packageName,
          installmentNo: item.no,
          installmentCount: plan.installmentCount,
          dueDate: item.dueDate,
          amount: item.amount,
          remainingAmount: item.remainingAmount,
          daysLate: item.daysLate,
        });
      }
    }
    return rows.sort((a, b) => b.daysLate - a.daysLate || a.memberName.localeCompare(b.memberName, 'tr'));
  }

  /** The member's own plans, for the mobile app. */
  async forMember(userId: string): Promise<ReceivableView[]> {
    const today = gymToday();
    return (await this.store.list<GymReceivable>(COLLECTION))
      .filter((item) => item.userId === userId && item.status !== 'cancelled')
      .map((item) => toView(item, today));
  }

  /**
   * Sells a package on installments: the membership starts right away, the down payment is booked
   * as income now and the rest becomes monthly installments tracked on the plan.
   */
  async createSale(dto: CreateInstallmentSaleDto): Promise<ReceivableView> {
    const member = await this.members.getByIdOrThrow(dto.userId);
    if (member.isArchived) {
      throw new AppException(ErrorCode.VALIDATION_ERROR, 'Member is archived');
    }
    const pkg = await this.packages.getByIdOrThrow(dto.packageId);
    if (pkg.status && pkg.status !== 'active') {
      throw new AppException(ErrorCode.GYM_PACKAGE_NOT_FOUND, 'Package is not available for sale');
    }
    const listPrice = Number(pkg.price ?? 0);
    const discount = dto.discount ?? 0;
    const totalKurus = toKurus(listPrice) - toKurus(discount);
    if (totalKurus <= 0) {
      throw new AppException(ErrorCode.VALIDATION_ERROR, 'Discount must be lower than the package price');
    }
    const downKurus = toKurus(dto.downPayment);
    const financedKurus = totalKurus - downKurus;
    if (financedKurus <= 0) {
      throw new AppException(
        ErrorCode.VALIDATION_ERROR,
        'Down payment covers the whole price; use a regular package sale instead',
      );
    }
    const today = gymToday();
    const firstDueDate = dto.firstDueDate ?? addMonths(today, 1);
    if (!isIsoDate(firstDueDate) || firstDueDate < today) {
      throw new AppException(ErrorCode.VALIDATION_ERROR, 'firstDueDate must be a valid date from today on');
    }

    const method = dto.paymentMethod ?? 'cash';
    const now = new Date();
    const paidAt = now.toISOString();
    const recordedBy = this.store.userId();
    if (downKurus > 0 && method === 'wallet') {
      await this.commerce.adjustWallet({
        userId: member.uid,
        walletType: 'debit',
        amount: toTl(downKurus),
        description: `${pkg.name} peşinat`,
        referenceId: pkg.id,
        referenceType: 'package',
        paymentMethod: 'wallet',
      });
    }

    const installments = buildSchedule(toTl(financedKurus), dto.installmentCount, firstDueDate);
    const payments: ReceivablePayment[] =
      downKurus > 0
        ? [{ id: randomUUID(), kind: 'down_payment', amount: toTl(downKurus), paymentMethod: method, paidAt, recordedBy, note: null }]
        : [];
    const plan = await this.store.create<GymReceivable>(COLLECTION, {
      userId: member.uid,
      memberName: member.displayName,
      memberNumber: member.memberNumber ?? null,
      memberPhone: member.phone ?? null,
      packageId: pkg.id,
      packageName: pkg.name,
      listPrice,
      discount: toTl(toKurus(discount)),
      totalAmount: toTl(totalKurus),
      downPayment: toTl(downKurus),
      financedAmount: toTl(financedKurus),
      installmentCount: dto.installmentCount,
      installments,
      payments,
      paidAmount: toTl(downKurus),
      remainingAmount: toTl(financedKurus),
      status: 'open',
      saleDate: paidAt,
      notes: dto.notes ?? null,
      cancelledAt: null,
      cancelReason: null,
    });

    const current = downKurus > 0 && method === 'wallet' ? await this.members.getByIdOrThrow(member.uid) : member;
    const updated = await this.members.save(applyPackage(current, pkg, toTl(totalKurus), now));
    await this.accessSync.syncMemberSafely(updated);
    if (downKurus > 0) {
      await this.bookIncome(plan, toTl(downKurus), method, `${pkg.name} peşinat`, 'membership');
    }
    return toView(plan, today);
  }

  /** Records a payment against the plan; it settles the oldest open installments first. */
  async recordPayment(id: string, dto: ReceivablePaymentDto): Promise<ReceivableView> {
    const plan = await this.getOrThrow(id);
    assertOpen(plan);
    const amount = toTl(toKurus(dto.amount));
    // Validates the amount against the remaining debt before any money moves.
    allocatePayment(plan.installments, amount, new Date().toISOString());

    if (dto.paymentMethod === 'wallet') {
      await this.commerce.adjustWallet({
        userId: plan.userId,
        walletType: 'debit',
        amount,
        description: `${plan.packageName} taksit ödemesi`,
        referenceId: plan.id,
        referenceType: 'receivable',
        paymentMethod: 'wallet',
      });
    }

    let saved: GymReceivable;
    try {
      saved = await this.applyPayment(id, amount, dto);
    } catch (error) {
      if (dto.paymentMethod === 'wallet') {
        await this.commerce.adjustWallet({
          userId: plan.userId,
          walletType: 'refund',
          amount,
          description: `${plan.packageName} taksit ödemesi iptal`,
          referenceId: plan.id,
          referenceType: 'receivable',
          paymentMethod: 'wallet',
        });
      }
      throw error;
    }
    await this.bookIncome(saved, amount, dto.paymentMethod, `${saved.packageName} taksit tahsilatı`, 'installment');
    return toView(saved, gymToday());
  }

  async cancel(id: string, dto: CancelReceivableDto): Promise<ReceivableView> {
    const plan = await this.getOrThrow(id);
    assertOpen(plan);
    const saved = await this.store.update<GymReceivable>(
      COLLECTION,
      id,
      ErrorCode.GYM_RECEIVABLE_NOT_FOUND,
      'Receivable not found',
      { status: 'cancelled', cancelledAt: new Date().toISOString(), cancelReason: dto.reason ?? null },
    );
    return toView(saved, gymToday());
  }

  /** Read-modify-write in a transaction so two desks cannot apply the same installment twice. */
  private async applyPayment(id: string, amount: number, dto: ReceivablePaymentDto): Promise<GymReceivable> {
    const ref = this.store.collection(COLLECTION).doc(id);
    const recordedBy = this.store.userId();
    return ref.firestore.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref);
      const current = snapshot.exists ? (snapshot.data() as GymReceivable) : null;
      if (!current || current.deletedAt) {
        throw new AppException(ErrorCode.GYM_RECEIVABLE_NOT_FOUND, 'Receivable not found');
      }
      assertOpen(current);
      const paidAt = new Date().toISOString();
      const installments = allocatePayment(current.installments, amount, paidAt);
      const remainingAmount = remainingOf(installments);
      const updated: GymReceivable = {
        ...current,
        installments,
        payments: [
          ...(current.payments ?? []),
          { id: randomUUID(), kind: 'installment', amount, paymentMethod: dto.paymentMethod, paidAt, recordedBy, note: dto.note ?? null },
        ],
        paidAmount: toTl(toKurus(current.paidAmount) + toKurus(amount)),
        remainingAmount,
        status: toKurus(remainingAmount) === 0 ? 'paid' : 'open',
        updatedAt: paidAt,
        updatedBy: recordedBy,
      };
      tx.set(ref, updated);
      return updated;
    });
  }

  private bookIncome(
    plan: GymReceivable,
    amount: number,
    method: ReceivablePaymentMethod,
    description: string,
    category: 'membership' | 'installment',
  ) {
    return this.store.create(TENANT_COLLECTION.gymAccountingEntries, {
      type: 'income',
      amount,
      category,
      userId: plan.userId,
      description,
      referenceId: plan.id,
      referenceType: 'receivable',
      paymentMethod: method,
      entryDate: new Date().toISOString(),
    });
  }

  private async openPlans(): Promise<GymReceivable[]> {
    return (await this.store.list<GymReceivable>(COLLECTION)).filter((item) => item.status === 'open');
  }

  private getOrThrow(id: string) {
    return this.store.getOrThrow<GymReceivable>(COLLECTION, id, ErrorCode.GYM_RECEIVABLE_NOT_FOUND, 'Receivable not found');
  }
}

function assertOpen(plan: GymReceivable): void {
  if (plan.status !== 'open') {
    throw new AppException(ErrorCode.GYM_RECEIVABLE_CLOSED, `Receivable is ${plan.status}`);
  }
}

function toView(plan: GymReceivable, today: string): ReceivableView {
  const { installments, ...rest } = plan;
  // Paid or cancelled plans are never late: an empty "today" sorts before every due date.
  return { ...rest, ...planStanding(installments, plan.status === 'open' ? today : '') };
}
