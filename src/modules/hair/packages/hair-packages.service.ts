import { Injectable } from '@nestjs/common';
import { TENANT_COLLECTION } from '../../../shared/firebase/firestore-path';
import { createBaseFields } from '../../../shared/firestore/base-document';
import { addDays } from '../shared/appointment-plan';
import { assertCashAllowed } from '../shared/cash-register';
import { MONEY_EPSILON } from '../shared/checkout-pricing';
import { assertNoRelated, hairInvalid, hairNotFound, hairPrecondition } from '../shared/hair-errors';
import { HairListQueryDto, searchTerm } from '../shared/hair-list.dto';
import { assertPayments, round2 } from '../shared/hair-money';
import { idempotency } from '../shared/hair-idempotency';
import { HairDoc, HairStore } from '../shared/hair-store';
import { dateIdInTz } from '../shared/hair-time';
import { fullName, live, matchesSearch, num, str } from '../shared/hair-tx';
import {
  CreateHairPackageDto,
  SellCustomerPackageDto,
  UpdateCustomerPackageDto,
  UpdateHairPackageDto,
} from './package.dto';

const PACKAGE_NOT_FOUND = 'Paket bulunamadı.';
const CUSTOMER_PACKAGE_NOT_FOUND = 'Müşteri paketi bulunamadı.';

@Injectable()
export class HairPackagesService {
  constructor(private readonly store: HairStore) {}

  // ── Package plans ──

  listPackages(query: HairListQueryDto) {
    const term = searchTerm(query);
    return this.store.list(TENANT_COLLECTION.hairPackages, {
      match: (item) =>
        (query.status ? (query.status === 'active') === (item['active'] !== false) : true) &&
        matchesSearch(item, term, ['name', 'description']),
      orderBy: { field: 'name', dir: 'asc' },
      limit: query.limit ?? 200,
      cursor: query.cursor,
    });
  }

  getPackage(id: string) {
    return this.store.getOrThrow(TENANT_COLLECTION.hairPackages, id, PACKAGE_NOT_FOUND);
  }

  async createPackage(dto: CreateHairPackageDto) {
    return this.store.create(TENANT_COLLECTION.hairPackages, 'hairPackages', {
      ...dto,
      name: dto.name.trim(),
      services: await this.resolveServices(dto.services),
      active: dto.active ?? true,
    });
  }

  async updatePackage(id: string, dto: UpdateHairPackageDto) {
    return this.store.update(
      TENANT_COLLECTION.hairPackages,
      'hairPackages',
      id,
      {
        ...dto,
        name: dto.name?.trim(),
        services: dto.services ? await this.resolveServices(dto.services) : undefined,
      },
      PACKAGE_NOT_FOUND,
    );
  }

  /** A plan that was ever sold stays (sold packages point at it); deactivate it instead. */
  async removePackage(id: string) {
    await this.getPackage(id);
    const sold = await this.store.rows(TENANT_COLLECTION.hairCustomerPackages, { field: 'packageId', op: '==', value: id });
    assertNoRelated('Bu paket satılmış; silmek yerine satışa kapatın (pasifleştirin).', { customerPackages: sold.length });
    return this.store.softDelete(TENANT_COLLECTION.hairPackages, 'hairPackages', id, PACKAGE_NOT_FOUND);
  }

  // ── Customer packages ──

  /** Sold packages; past `endDate` rows still marked active are reported as `expired`. */
  async listCustomerPackages(query: HairListQueryDto) {
    const actor = await this.store.actorOrThrow();
    const branch = this.store.branchFilter(actor, query.branchId);
    const today = dateIdInTz(await this.store.timeZone());
    const page = await this.store.list(TENANT_COLLECTION.hairCustomerPackages, {
      equals: { customerId: query.customerId },
      match: (item) => {
        // Packages sold without a branch are usable everywhere.
        const itemBranch = str(item['branchId']);
        const inBranch = branch.equals
          ? itemBranch === branch.equals || !itemBranch
          : !branch.anyOf || !itemBranch || branch.anyOf.includes(itemBranch);
        return inBranch && (!query.status || effectiveStatus(item, today) === query.status);
      },
      orderBy: { field: 'startDate', dir: 'desc' },
      limit: query.limit,
      cursor: query.cursor,
    });
    return { ...page, items: page.items.map((item) => ({ ...item, status: effectiveStatus(item, today) })) };
  }

  /** Sells a package to a customer; optional payments are recorded (and must cover the price). */
  async sell(dto: SellCustomerPackageDto) {
    const actor = await this.store.actorOrThrow();
    const payments = assertPayments(dto.payments ?? [], { allowEmpty: true });
    const branchId = dto.branchId ?? (payments.length > 0 ? await this.defaultBranch(dto.customerId, actor.branchIds) : undefined);
    if (branchId) this.store.assertBranchAccess(actor, branchId);
    const today = dateIdInTz(await this.store.timeZone());
    const startDate = dto.startDate ?? today;
    const userId = this.store.userId();
    const pkgRef = this.store.newRef(TENANT_COLLECTION.hairCustomerPackages);

    const outcome = await this.store.runTransaction(async (tx) => {
      const idem = await idempotency<HairDoc>(tx, this.store, 'packageSale', dto.idempotencyKey, dto);
      if (idem.replay) return { doc: idem.replay, replay: true };
      const plan = live(await tx.get(this.store.ref(TENANT_COLLECTION.hairPackages, dto.packageId)));
      if (!plan) throw hairNotFound(PACKAGE_NOT_FOUND);
      if (plan['active'] === false) throw hairPrecondition('Bu paket satışta değil.');
      const customerRef = this.store.ref(TENANT_COLLECTION.hairCustomers, dto.customerId);
      const customer = live(await tx.get(customerRef));
      if (!customer) throw hairNotFound('Müşteri bulunamadı.');
      const price = num(plan['price']);
      if (payments.length > 0) {
        const paid = round2(payments.reduce((sum, p) => sum + p.amount, 0));
        if (Math.abs(paid - price) > MONEY_EPSILON) {
          throw hairPrecondition(`Ödeme toplamı (${paid}) paket fiyatına (${price}) eşit olmalı.`);
        }
        await assertCashAllowed(tx, this.store, branchId!, today, payments);
      }
      const now = new Date().toISOString();
      const customerName = fullName(customer);
      const doc = {
        ...createBaseFields(pkgRef.id, userId, now),
        customerId: dto.customerId,
        customerName,
        packageId: dto.packageId,
        packageName: str(plan['name']),
        services: Array.isArray(plan['services']) ? plan['services'] : [],
        totalSessions: num(plan['totalSessions']),
        remainingSessions: num(plan['totalSessions']),
        price,
        status: 'active',
        startDate,
        endDate: addDays(startDate, num(plan['validityDays'])),
        branchId: branchId ?? null,
        paid: payments.length > 0,
      };
      tx.set(pkgRef, doc);
      if (payments.length > 0) {
        const paymentRef = this.store.newRef(TENANT_COLLECTION.hairPayments);
        tx.set(paymentRef, {
          ...createBaseFields(paymentRef.id, userId, now),
          sessionId: null,
          customerPackageId: pkgRef.id,
          customerId: dto.customerId,
          customerName,
          branchId,
          staffId: dto.staffId ?? null,
          lines: payments,
          totalAmount: price,
          date: today,
          notes: `Paket satışı: ${str(plan['name'])}`,
          isRefund: false,
        });
        tx.update(customerRef, { totalSpent: round2(num(customer['totalSpent']) + price), updatedAt: now });
      }
      idem.save(doc);
      return { doc: doc as HairDoc, replay: false };
    });
    if (!outcome.replay) {
      await this.store.audit('hairCustomerPackages', 'create', pkgRef.id, null, {
        customerId: dto.customerId,
        packageId: dto.packageId,
        price: outcome.doc['price'],
      });
    }
    return outcome.doc;
  }

  updateCustomerPackage(id: string, dto: UpdateCustomerPackageDto) {
    return this.store.update(
      TENANT_COLLECTION.hairCustomerPackages,
      'hairCustomerPackages',
      id,
      dto,
      CUSTOMER_PACKAGE_NOT_FOUND,
    );
  }

  /** Register branch for a sale without `branchId`: customer's preferred, caller's first, or first active. */
  private async defaultBranch(customerId: string, actorBranches: string[] | null): Promise<string> {
    const customer = await this.store.find(TENANT_COLLECTION.hairCustomers, customerId);
    const preferred = str(customer?.['preferredBranchId']);
    if (preferred && (!actorBranches || actorBranches.includes(preferred))) return preferred;
    if (actorBranches?.length) return actorBranches[0];
    const branches = await this.store.rows(TENANT_COLLECTION.hairBranches);
    const first = branches.filter((b) => b['active'] !== false).sort((a, b) => str(a['name']).localeCompare(str(b['name']), 'tr'))[0];
    if (!first) throw hairInvalid('Ödeme alınacaksa branchId zorunludur.');
    return first.id;
  }

  private async resolveServices(services: { serviceId: string }[]) {
    const resolved = [];
    for (const { serviceId } of services) {
      const service = await this.store.find(TENANT_COLLECTION.hairServices, serviceId);
      if (!service) throw hairNotFound(`Hizmet bulunamadı: ${serviceId}`);
      resolved.push({ serviceId, serviceName: str(service['name']) });
    }
    return resolved;
  }
}

function effectiveStatus(item: Record<string, unknown>, today: string): string {
  const status = str(item['status'], 'active');
  if (status === 'active' && str(item['endDate']) && str(item['endDate']) < today) return 'expired';
  return status;
}
