import { Injectable } from '@nestjs/common';
import { TENANT_COLLECTION } from '../../../shared/firebase/firestore-path';
import { createBaseFields } from '../../../shared/firestore/base-document';
import { assertCashAllowed, registerId, summarizeCash } from '../shared/cash-register';
import { hairInvalid, hairNotFound, hairPrecondition } from '../shared/hair-errors';
import { HairListQueryDto, inclusiveTo, searchTerm } from '../shared/hair-list.dto';
import { assertPayments, PaymentLine, round2 } from '../shared/hair-money';
import { HairActor, HairDoc, HairStore } from '../shared/hair-store';
import { dateIdInTz } from '../shared/hair-time';
import { fullName, live, matchesSearch, num, str } from '../shared/hair-tx';
import {
  CashRegisterQueryDto,
  CloseCashRegisterDto,
  CountCashRegisterDto,
  CreateHairCommissionRuleDto,
  CreateHairExpenseDto,
  CreateHairPaymentDto,
  OpenCashRegisterDto,
  PayoutCommissionsDto,
  UpdateHairCommissionRuleDto,
  UpdateHairExpenseDto,
} from './finance.dto';

const PAYMENT_NOT_FOUND = 'Ödeme bulunamadı.';
const EXPENSE_NOT_FOUND = 'Gider kaydı bulunamadı.';
const RULE_NOT_FOUND = 'Komisyon kuralı bulunamadı.';

@Injectable()
export class HairFinanceService {
  constructor(private readonly store: HairStore) {}

  // ── Payments ──

  async listPayments(query: HairListQueryDto) {
    const actor = await this.store.actorOrThrow();
    const branch = this.store.branchFilter(actor, query.branchId);
    return this.store.list(TENANT_COLLECTION.hairPayments, {
      dateField: 'date',
      from: query.from,
      to: inclusiveTo(query.to),
      equals: { branchId: branch.equals, customerId: query.customerId, staffId: query.staffId },
      anyOf: branch.anyOf ? { field: 'branchId', values: branch.anyOf } : undefined,
      match: query.type
        ? (item) => ((item['lines'] as PaymentLine[] | undefined) ?? []).some((line) => line.method === query.type)
        : undefined,
      orderBy: { field: 'createdAt', dir: 'desc' },
      limit: query.limit,
      cursor: query.cursor,
    });
  }

  async getPayment(id: string) {
    const actor = await this.store.actorOrThrow();
    const payment = await this.store.getOrThrow(TENANT_COLLECTION.hairPayments, id, PAYMENT_NOT_FOUND);
    this.store.assertBranchAccess(actor, str(payment['branchId']));
    return payment;
  }

  /** Manual payment outside POS (e.g. a debt collected later); cash needs an open register (K-005). */
  async createPayment(dto: CreateHairPaymentDto) {
    const actor = await this.store.actorOrThrow();
    this.store.assertBranchAccess(actor, dto.branchId);
    const lines = assertPayments(dto.lines);
    const date = dto.date ?? dateIdInTz(await this.store.timeZone());
    const ref = this.store.newRef(TENANT_COLLECTION.hairPayments);
    const userId = this.store.userId();
    const payment = await this.store.runTransaction(async (tx) => {
      const customer = live(await tx.get(this.store.ref(TENANT_COLLECTION.hairCustomers, dto.customerId)));
      if (!customer) throw hairNotFound('Müşteri bulunamadı.');
      const staff = dto.staffId ? live(await tx.get(this.store.ref(TENANT_COLLECTION.hairStaff, dto.staffId))) : null;
      if (dto.staffId && !staff) throw hairNotFound('Personel bulunamadı.');
      await assertCashAllowed(tx, this.store, dto.branchId, date, lines);
      const doc = {
        ...createBaseFields(ref.id, userId),
        sessionId: null,
        customerId: dto.customerId,
        customerName: fullName(customer),
        branchId: dto.branchId,
        staffId: dto.staffId ?? null,
        staffName: staff ? fullName(staff) : null,
        lines,
        totalAmount: round2(lines.reduce((sum, line) => sum + line.amount, 0)),
        date,
        notes: dto.notes ?? '',
        isRefund: false,
      };
      tx.set(ref, doc);
      return doc;
    });
    await this.store.audit('hairPayments', 'create', ref.id, null, { totalAmount: payment.totalAmount, date });
    return payment;
  }

  // ── Expenses ──

  async listExpenses(query: HairListQueryDto) {
    const actor = await this.store.actorOrThrow();
    const branch = this.store.branchFilter(actor, query.branchId);
    const term = searchTerm(query);
    return this.store.list(TENANT_COLLECTION.hairExpenses, {
      dateField: 'date',
      from: query.from,
      to: inclusiveTo(query.to),
      equals: { branchId: branch.equals, category: query.categoryId, staffId: query.staffId, paymentMethod: query.type },
      anyOf: branch.anyOf ? { field: 'branchId', values: branch.anyOf } : undefined,
      match: (item) => matchesSearch(item, term, ['category', 'description']),
      orderBy: { field: 'date', dir: 'desc' },
      limit: query.limit,
      cursor: query.cursor,
    });
  }

  async createExpense(dto: CreateHairExpenseDto) {
    const actor = await this.store.actorOrThrow();
    this.store.assertBranchAccess(actor, dto.branchId);
    const date = dto.date ?? dateIdInTz(await this.store.timeZone());
    const ref = this.store.newRef(TENANT_COLLECTION.hairExpenses);
    const userId = this.store.userId();
    const expense = await this.store.runTransaction(async (tx) => {
      await assertCashAllowed(tx, this.store, dto.branchId, date, [{ method: dto.paymentMethod }]);
      const doc = { ...createBaseFields(ref.id, userId), ...stripUndefined({ ...dto, category: dto.category.trim() }), date };
      tx.set(ref, doc);
      return doc;
    });
    await this.store.audit('hairExpenses', 'create', ref.id, null, expense);
    return expense;
  }

  async updateExpense(id: string, dto: UpdateHairExpenseDto) {
    const actor = await this.store.actorOrThrow();
    const current = await this.store.getOrThrow(TENANT_COLLECTION.hairExpenses, id, EXPENSE_NOT_FOUND);
    this.store.assertBranchAccess(actor, str(current['branchId']));
    if (dto.branchId) this.store.assertBranchAccess(actor, dto.branchId);
    await this.assertDayNotClosed(str(current['branchId']), str(current['date']));
    if (dto.date || dto.branchId) await this.assertDayNotClosed(dto.branchId ?? str(current['branchId']), dto.date ?? str(current['date']));
    return this.store.update(TENANT_COLLECTION.hairExpenses, 'hairExpenses', id, dto, EXPENSE_NOT_FOUND);
  }

  async removeExpense(id: string) {
    const actor = await this.store.actorOrThrow();
    const current = await this.store.getOrThrow(TENANT_COLLECTION.hairExpenses, id, EXPENSE_NOT_FOUND);
    this.store.assertBranchAccess(actor, str(current['branchId']));
    await this.assertDayNotClosed(str(current['branchId']), str(current['date']));
    return this.store.softDelete(TENANT_COLLECTION.hairExpenses, 'hairExpenses', id, EXPENSE_NOT_FOUND);
  }

  // ── Cash register (plan §8.5) ──

  /** The register of one branch and day plus live totals (expected closing per K-003). */
  async cashRegisterDay(query: CashRegisterQueryDto) {
    const actor = await this.store.actorOrThrow();
    const branchId = await this.resolveBranch(actor, query.branchId);
    const date = query.date ?? dateIdInTz(await this.store.timeZone());
    const register = await this.store.find(TENANT_COLLECTION.hairCashRegisterDays, registerId(branchId, date));
    const totals = await this.dayTotals(branchId, date, num(register?.['openingBalance']));
    return { branchId, date, register: register ?? null, ...totals };
  }

  async openRegister(dto: OpenCashRegisterDto) {
    const actor = await this.store.actorOrThrow();
    this.store.assertBranchAccess(actor, dto.branchId);
    await this.store.getOrThrow(TENANT_COLLECTION.hairBranches, dto.branchId, 'Şube bulunamadı.');
    const date = dateIdInTz(await this.store.timeZone());
    const ref = this.store.ref(TENANT_COLLECTION.hairCashRegisterDays, registerId(dto.branchId, date));
    const userId = this.store.userId();
    const register = await this.store.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref);
      if (snapshot.exists) {
        throw hairPrecondition(
          snapshot.data()?.['status'] === 'closed' ? 'Bugünün kasası kapatılmış.' : 'Kasa zaten açık.',
        );
      }
      const now = new Date().toISOString();
      const doc = {
        ...createBaseFields(ref.id, userId, now),
        branchId: dto.branchId,
        date,
        openingBalance: dto.openingBalance,
        status: 'open',
        openedBy: userId,
        openedAt: now,
      };
      tx.set(ref, doc);
      return doc;
    });
    await this.store.audit('hairCashRegister', 'create', ref.id, null, { openingBalance: dto.openingBalance });
    return register;
  }

  /** Closes today's register: snapshots the totals and the expected vs. counted difference (K-002/K-004). */
  async closeRegister(dto: CloseCashRegisterDto) {
    const actor = await this.store.actorOrThrow();
    this.store.assertBranchAccess(actor, dto.branchId);
    const date = dateIdInTz(await this.store.timeZone());
    const ref = this.store.ref(TENANT_COLLECTION.hairCashRegisterDays, registerId(dto.branchId, date));
    const userId = this.store.userId();
    const register = await this.store.runTransaction(async (tx) => {
      const current = live(await tx.get(ref));
      if (!current) throw hairPrecondition('Bugün için açılmış bir kasa yok.');
      if (current['status'] !== 'open') throw hairPrecondition('Kasa zaten kapatılmış.');
      const [payments, expenses] = await Promise.all([
        tx.get(this.store.collection(TENANT_COLLECTION.hairPayments).where('date', '==', date)),
        tx.get(this.store.collection(TENANT_COLLECTION.hairExpenses).where('date', '==', date)),
      ]);
      const rows = (snapshot: { docs: { data(): unknown }[] }) =>
        snapshot.docs
          .map((doc) => doc.data() as HairDoc)
          .filter((row) => !row.deletedAt && row['branchId'] === dto.branchId);
      const totals = summarizeCash({
        openingBalance: num(current['openingBalance']),
        payments: rows(payments) as { lines?: PaymentLine[] }[],
        expenses: rows(expenses).map((e) => ({ amount: num(e['amount']), paymentMethod: str(e['paymentMethod']) })),
      });
      const now = new Date().toISOString();
      const doc = {
        ...current,
        status: 'closed',
        ...totals,
        closingBalance: totals.expectedClosing,
        ...(dto.countedBalance !== undefined
          ? { countedBalance: dto.countedBalance, difference: round2(dto.countedBalance - totals.expectedClosing) }
          : {}),
        notes: dto.notes ?? current['notes'],
        closedBy: userId,
        closedAt: now,
        updatedAt: now,
        updatedBy: userId,
      };
      tx.set(ref, stripUndefined(doc));
      return doc;
    });
    await this.store.audit('hairCashRegister', 'update', ref.id, { status: 'open' }, {
      status: 'closed',
      closingBalance: register.closingBalance,
      countedBalance: register['countedBalance'],
    });
    return register;
  }

  /** Physical cash count (K-004) on today's register, open or closed. */
  async countRegister(dto: CountCashRegisterDto) {
    const actor = await this.store.actorOrThrow();
    this.store.assertBranchAccess(actor, dto.branchId);
    const date = dateIdInTz(await this.store.timeZone());
    const id = registerId(dto.branchId, date);
    const current = await this.store.find(TENANT_COLLECTION.hairCashRegisterDays, id);
    if (!current) throw hairPrecondition('Bugün için açılmış bir kasa yok.');
    const expected =
      current['status'] === 'closed'
        ? num(current['closingBalance'])
        : (await this.dayTotals(dto.branchId, date, num(current['openingBalance']))).expectedClosing;
    return this.store.update(
      TENANT_COLLECTION.hairCashRegisterDays,
      'hairCashRegister',
      id,
      {
        countedBalance: dto.countedBalance,
        expectedAtCount: expected,
        difference: round2(dto.countedBalance - expected),
        countedAt: new Date().toISOString(),
        countedBy: this.store.userId(),
      },
      'Kasa bulunamadı.',
    );
  }

  // ── Commissions (plan §8.3) ──

  async listCommissions(query: HairListQueryDto) {
    const actor = await this.store.actorOrThrow();
    const staffId = this.store.staffFilter(actor, 'hairCommissions', query.staffId);
    const branch = this.store.branchFilter(actor, query.branchId);
    return this.store.list(TENANT_COLLECTION.hairCommissions, {
      dateField: 'date',
      from: query.from,
      to: inclusiveTo(query.to),
      equals: { staffId, payoutStatus: query.status },
      match: (item) => {
        const itemBranch = str(item['branchId']);
        if (branch.equals) return itemBranch === branch.equals;
        return !branch.anyOf || !itemBranch || branch.anyOf.includes(itemBranch);
      },
      orderBy: { field: 'date', dir: 'desc' },
      limit: query.limit,
      cursor: query.cursor,
    });
  }

  listRules() {
    return this.store.list(TENANT_COLLECTION.hairCommissionRules, {
      orderBy: { field: 'priority', dir: 'asc' },
      limit: 200,
    });
  }

  async createRule(dto: CreateHairCommissionRuleDto) {
    assertRuleValue(dto.type, dto.value);
    await this.assertRuleRef(dto.scope, dto.refId);
    return this.store.create(TENANT_COLLECTION.hairCommissionRules, 'hairCommissionRules', {
      ...dto,
      priority: dto.priority ?? 100,
      active: dto.active ?? true,
    });
  }

  async updateRule(id: string, dto: UpdateHairCommissionRuleDto) {
    const current = await this.store.getOrThrow(TENANT_COLLECTION.hairCommissionRules, id, RULE_NOT_FOUND);
    assertRuleValue(dto.type ?? str(current['type']), dto.value ?? num(current['value']));
    if (dto.scope || dto.refId) {
      await this.assertRuleRef(dto.scope ?? (current['scope'] as CreateHairCommissionRuleDto['scope']), dto.refId ?? str(current['refId']));
    }
    return this.store.update(TENANT_COLLECTION.hairCommissionRules, 'hairCommissionRules', id, dto, RULE_NOT_FOUND);
  }

  removeRule(id: string) {
    return this.store.softDelete(TENANT_COLLECTION.hairCommissionRules, 'hairCommissionRules', id, RULE_NOT_FOUND);
  }

  /** Marks the selected unpaid commissions as paid under one payout record. */
  async payout(dto: PayoutCommissionsDto) {
    const ids = [...new Set(dto.commissionIds)];
    const userId = this.store.userId();
    const payoutRef = this.store.newRef(TENANT_COLLECTION.hairCommissionPayouts);
    const result = await this.store.runTransaction(async (tx) => {
      const refs = ids.map((id) => this.store.ref(TENANT_COLLECTION.hairCommissions, id));
      const snapshots = await Promise.all(refs.map((ref) => tx.get(ref)));
      let total = 0;
      const byStaff = new Map<string, number>();
      snapshots.forEach((snapshot) => {
        const commission = live(snapshot);
        if (!commission) throw hairNotFound('Komisyon kaydı bulunamadı.');
        if (commission['payoutStatus'] !== 'unpaid') throw hairPrecondition('Yalnızca ödenmemiş komisyonlar ödenebilir.');
        total += num(commission['amount']);
        const staffId = str(commission['staffId']);
        byStaff.set(staffId, round2((byStaff.get(staffId) ?? 0) + num(commission['amount'])));
      });
      const now = new Date().toISOString();
      const payout = {
        ...createBaseFields(payoutRef.id, userId, now),
        commissionIds: ids,
        totalAmount: round2(total),
        byStaff: [...byStaff].map(([staffId, amount]) => ({ staffId, amount })),
        notes: dto.notes ?? '',
        paidAt: now,
      };
      tx.set(payoutRef, payout);
      refs.forEach((ref) =>
        tx.update(ref, { payoutStatus: 'paid', payoutId: payoutRef.id, paidAt: now, updatedAt: now, updatedBy: userId }),
      );
      return payout;
    });
    await this.store.audit('hairCommissionPayouts', 'create', payoutRef.id, null, {
      totalAmount: result.totalAmount,
      count: ids.length,
    });
    return result;
  }

  // ── Audit log ──

  listAuditLogs(query: HairListQueryDto) {
    return this.store.list(TENANT_COLLECTION.hairAuditLogs, {
      dateField: 'createdAt',
      from: query.from,
      to: query.to,
      equals: { entity: query.type },
      orderBy: { field: 'createdAt', dir: 'desc' },
      limit: query.limit ?? 100,
      cursor: query.cursor,
    });
  }

  // ── helpers ──

  /** Payments / expenses of one branch and day folded into register totals. */
  async dayTotals(branchId: string, date: string, openingBalance: number) {
    const [payments, expenses] = await Promise.all([
      this.store.rows(TENANT_COLLECTION.hairPayments, { field: 'date', op: '==', value: date }),
      this.store.rows(TENANT_COLLECTION.hairExpenses, { field: 'date', op: '==', value: date }),
    ]);
    const totals = summarizeCash({
      openingBalance,
      payments: payments.filter((p) => p['branchId'] === branchId) as { lines?: PaymentLine[] }[],
      expenses: expenses
        .filter((e) => e['branchId'] === branchId)
        .map((e) => ({ amount: num(e['amount']), paymentMethod: str(e['paymentMethod']) })),
    });
    return {
      cashIn: totals.cashIn,
      cashOut: totals.cashOut,
      cashExpenses: totals.cashExpenses,
      cardTotal: totals.cardTotal,
      transferTotal: totals.transferTotal,
      otherTotal: totals.otherTotal,
      totalIncome: totals.totalIncome,
      expectedClosing: totals.expectedClosing,
      byPaymentMethod: totals.byPaymentMethod,
    };
  }

  private async resolveBranch(actor: HairActor, branchId: string | undefined): Promise<string> {
    if (branchId) {
      this.store.assertBranchAccess(actor, branchId);
      return branchId;
    }
    if (actor.branchIds?.length) return actor.branchIds[0];
    const branches = await this.store.list(TENANT_COLLECTION.hairBranches, {
      orderBy: { field: 'name', dir: 'asc' },
      match: (item) => item['active'] !== false,
      limit: 1,
    });
    const first = branches.items[0];
    if (!first) throw hairInvalid('branchId zorunludur.');
    return first.id;
  }

  private async assertDayNotClosed(branchId: string, date: string) {
    if (!branchId || !date) return;
    const register = await this.store.find(TENANT_COLLECTION.hairCashRegisterDays, registerId(branchId, date));
    if (register?.['status'] === 'closed') {
      throw hairPrecondition('Bu günün kasası kapatılmış; kayıt değiştirilemez.');
    }
  }

  private async assertRuleRef(scope: CreateHairCommissionRuleDto['scope'], refId: string) {
    const collection = {
      staff: TENANT_COLLECTION.hairStaff,
      serviceCategory: TENANT_COLLECTION.hairServiceCategories,
      service: TENANT_COLLECTION.hairServices,
    }[scope];
    const found = await this.store.find(collection, refId);
    if (!found) throw hairNotFound('Kuralın bağlı olduğu kayıt bulunamadı.');
  }
}


function assertRuleValue(type: string, value: number) {
  if (type === 'percent' && value > 100) throw hairInvalid('Yüzde oranı 100’ü aşamaz.');
}

function stripUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}

