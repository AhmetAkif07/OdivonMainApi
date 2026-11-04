import { Injectable } from '@nestjs/common';
import { AuditAction } from '../../../../shared/audit/audit.types';
import { AppException } from '../../../../shared/errors/app.exception';
import { ErrorCode } from '../../../../shared/errors/error-codes';
import { TENANT_COLLECTION, tenantCollectionPath } from '../../../../shared/firebase/firestore-path';
import { isDeleted, omitUndefined } from '../../../../shared/firestore/base-document';
import { IdentityRepository } from '../../../identity/identity.repository';
import { addDaysToDate } from '../../insights/day-end.logic';
import { DocStoreConfig, TenantDocStore } from '../../shared/tenant-doc-store';
import { CommissionReportQueryDto, CreateCommissionRuleDto, UpdateCommissionRuleDto } from './commission.dto';
import { CommissionReport, CommissionRule } from './commission.entity';
import { CommissionProduct, CommissionSale, buildCommissionReport } from './commission.logic';

@Injectable()
export class CommissionRulesRepository extends TenantDocStore<CommissionRule> {
  protected readonly config: DocStoreConfig = {
    collection: TENANT_COLLECTION.commissionRules,
    entity: 'commissionRule',
    notFound: ErrorCode.COMMISSION_RULE_NOT_FOUND,
    notFoundMessage: 'Prim kuralı bulunamadı',
    actions: {
      created: AuditAction.COMMISSION_RULE_CREATED,
      updated: AuditAction.COMMISSION_RULE_UPDATED,
      deleted: AuditAction.COMMISSION_RULE_DELETED,
    },
  };

  /** Reads any tenant collection (sales, products, appointments) for the report. */
  async readAll<T>(collection: string): Promise<T[]> {
    const snapshot = await this.firebase.db
      .collection(tenantCollectionPath(this.tenantContext.getTenantId(), collection))
      .get();
    return snapshot.docs.map((doc) => doc.data() as T & { deletedAt?: string | null }).filter((item) => !isDeleted(item));
  }

  async readSince<T>(collection: string, field: string, from: string): Promise<T[]> {
    const snapshot = await this.firebase.db
      .collection(tenantCollectionPath(this.tenantContext.getTenantId(), collection))
      .where(field, '>=', from)
      .get();
    return snapshot.docs.map((doc) => doc.data() as T & { deletedAt?: string | null }).filter((item) => !isDeleted(item));
  }
}

const MAX_RANGE_DAYS = 366;

@Injectable()
export class CommissionsService {
  constructor(
    private readonly rules: CommissionRulesRepository,
    private readonly identity: IdentityRepository,
  ) {}

  private async staffNames(): Promise<Map<string, string>> {
    const users = await this.identity.listByCurrentTenant();
    return new Map(users.map((user) => [user.uid, user.displayName || user.email]));
  }

  private async staffRoles(): Promise<Map<string, string[]>> {
    const users = await this.identity.listByCurrentTenant();
    return new Map(users.map((user) => [user.uid, user.roleIds ?? []]));
  }

  /** Person or role a rule is for; a person wins over a role. */
  private async target(userId: string | null | undefined, roleId: string | null | undefined) {
    if (userId) {
      const names = await this.staffNames();
      return { userId, staffName: names.get(userId) ?? null, roleId: null, roleName: null };
    }
    if (roleId) {
      const role = (await this.rules.readAll<{ id: string; name?: string }>(TENANT_COLLECTION.roles)).find((item) => item.id === roleId);
      if (!role) throw new AppException(ErrorCode.VALIDATION_ERROR, 'Rol bulunamadı');
      return { userId: null, staffName: null, roleId, roleName: role.name ?? null };
    }
    return { userId: null, staffName: null, roleId: null, roleName: null };
  }

  private checkDates(validFrom: string | null, validTo: string | null): void {
    if (validFrom && validTo && validTo < validFrom) {
      throw new AppException(ErrorCode.VALIDATION_ERROR, 'Bitiş tarihi başlangıçtan önce olamaz');
    }
  }

  private normalize(dto: CreateCommissionRuleDto | UpdateCommissionRuleDto, current?: CommissionRule) {
    const kind = dto.kind ?? current?.kind ?? 'commission';
    const basis = dto.basis ?? current?.basis ?? 'percent';
    const rate = dto.rate ?? current?.rate ?? 0;
    if (kind === 'commission' && basis === 'percent' && rate > 100) {
      throw new AppException(ErrorCode.VALIDATION_ERROR, 'Yüzde oranı 100\'den büyük olamaz');
    }
    const scope = dto.scope ?? current?.scope ?? 'all';
    const targetIds = scope === 'all' ? [] : dto.targetIds ?? current?.targetIds ?? [];
    if (kind === 'commission' && scope !== 'all' && !targetIds.length) {
      throw new AppException(ErrorCode.VALIDATION_ERROR, 'Kapsam için en az bir seçim yapın');
    }
    return { kind, basis, rate, scope, targetIds };
  }

  list(): Promise<CommissionRule[]> {
    return this.rules.collect().then((items) => items.sort((a, b) => a.name.localeCompare(b.name, 'tr')));
  }

  async create(dto: CreateCommissionRuleDto): Promise<CommissionRule> {
    const validFrom = dto.validFrom || null;
    const validTo = dto.validTo || null;
    this.checkDates(validFrom, validTo);
    return this.rules.create({
      name: dto.name.trim(),
      ...(await this.target(dto.userId, dto.roleId)),
      active: dto.active ?? true,
      validFrom,
      validTo,
      minTotal: dto.minTotal ?? 0,
      threshold: dto.threshold ?? 0,
      amount: dto.amount ?? 0,
      ...this.normalize(dto),
    });
  }

  async update(id: string, dto: UpdateCommissionRuleDto): Promise<CommissionRule> {
    const current = await this.rules.getByIdOrThrow(id);
    const targetChanged = dto.userId !== undefined || dto.roleId !== undefined;
    const validFrom = dto.validFrom === undefined ? current.validFrom ?? null : dto.validFrom || null;
    const validTo = dto.validTo === undefined ? current.validTo ?? null : dto.validTo || null;
    this.checkDates(validFrom, validTo);
    return this.rules.save({
      ...current,
      ...omitUndefined({
        name: dto.name?.trim(),
        active: dto.active,
        threshold: dto.threshold,
        amount: dto.amount,
        minTotal: dto.minTotal,
      }),
      validFrom,
      validTo,
      ...(targetChanged
        ? await this.target(
            dto.userId === undefined ? current.userId : dto.userId,
            dto.roleId === undefined ? current.roleId : dto.roleId,
          )
        : {}),
      ...this.normalize(dto, current),
    });
  }

  async remove(id: string): Promise<void> {
    await this.rules.softDelete(await this.rules.getByIdOrThrow(id));
  }

  async report(query: CommissionReportQueryDto): Promise<CommissionReport> {
    if (query.to < query.from || query.to > addDaysToDate(query.from, MAX_RANGE_DAYS)) {
      throw new AppException(ErrorCode.VALIDATION_ERROR, 'Tarih aralığı en fazla 1 yıl olabilir');
    }
    // One day earlier covers sales stored in UTC just before local midnight.
    const fromKey = addDaysToDate(query.from, -1);
    const [sales, rules, products, staffNames, staffRoles] = await Promise.all([
      this.rules.readSince<CommissionSale>(TENANT_COLLECTION.sales, 'date', fromKey),
      this.rules.collect(),
      this.rules.readAll<CommissionProduct>(TENANT_COLLECTION.products),
      this.staffNames(),
      this.staffRoles(),
    ]);
    const appointmentIds = [...new Set(sales.map((sale) => sale.appointmentId).filter((id): id is string => Boolean(id)))];
    const appointments = appointmentIds.length
      ? await this.rules.readSince<{ id: string; doctorId?: string }>(TENANT_COLLECTION.appointments, 'beginAt', addDaysToDate(fromKey, -30))
      : [];
    const appointmentDoctors = new Map(
      appointments.filter((item) => item.doctorId && appointmentIds.includes(item.id)).map((item) => [item.id, item.doctorId!]),
    );
    return buildCommissionReport({
      from: query.from,
      to: query.to,
      sales,
      rules,
      products: new Map(products.map((product) => [product.id, product])),
      appointmentDoctors,
      staffNames,
      staffRoles,
    });
  }
}
