import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Query, Transaction } from 'firebase-admin/firestore';
import {
  PermissionAction,
  PermissionResource,
  hasPermission,
} from '../../../shared/authorization/permissions';
import { FirebaseService } from '../../../shared/firebase/firebase.service';
import { tenantCollectionPath } from '../../../shared/firebase/firestore-path';
import {
  createBaseFields,
  isDeleted,
  omitUndefined,
  touchBaseFields,
} from '../../../shared/firestore/base-document';
import { TenantContext } from '../../../shared/tenancy/tenant.context';

export type BeautyDoc = Record<string, unknown> & {
  id: string;
  createdAt?: string;
  deletedAt?: string | null;
};
export interface AuditMeta {
  ip?: string;
  userAgent?: string;
  requestId?: string;
  branchId?: string;
}
export interface ResourceConfig {
  collection: string;
  permission: PermissionResource;
  branchRequired?: boolean;
}

export const BEAUTY_RESOURCES: Record<string, ResourceConfig> = {
  branches: { collection: 'beautyBranches', permission: 'beautyBranches' },
  customers: { collection: 'beautyCustomers', permission: 'beautyCustomers', branchRequired: true },
  health: { collection: 'beautyCustomerHealth', permission: 'beautyHealth', branchRequired: true },
  'skin-analyses': {
    collection: 'beautySkinAnalyses',
    permission: 'beautyHealth',
    branchRequired: true,
  },
  consents: { collection: 'beautyConsentForms', permission: 'beautyHealth', branchRequired: true },
  appointments: {
    collection: 'beautyAppointments',
    permission: 'beautyAppointments',
    branchRequired: true,
  },
  sessions: { collection: 'beautySessions', permission: 'beautySessions', branchRequired: true },
  packages: {
    collection: 'beautyServicePackages',
    permission: 'beautySessions',
    branchRequired: true,
  },
  'customer-packages': {
    collection: 'beautyCustomerPackages',
    permission: 'beautySessions',
    branchRequired: true,
  },
  'service-categories': {
    collection: 'beautyServiceCategories',
    permission: 'beautyCatalog',
    branchRequired: true,
  },
  services: { collection: 'beautyServices', permission: 'beautyCatalog', branchRequired: true },
  devices: { collection: 'beautyDevices', permission: 'beautyResources', branchRequired: true },
  rooms: { collection: 'beautyRooms', permission: 'beautyResources', branchRequired: true },
  staff: { collection: 'beautyStaff', permission: 'beautyStaff', branchRequired: true },
  shifts: { collection: 'beautyShifts', permission: 'beautyStaff', branchRequired: true },
  'time-off': { collection: 'beautyTimeOff', permission: 'beautyStaff', branchRequired: true },
  payments: { collection: 'beautyPayments', permission: 'beautyFinance', branchRequired: true },
  invoices: { collection: 'beautyInvoices', permission: 'beautyFinance', branchRequired: true },
  expenses: { collection: 'beautyExpenses', permission: 'beautyFinance', branchRequired: true },
  'cash-register-days': {
    collection: 'beautyCashRegisterDays',
    permission: 'beautyFinance',
    branchRequired: true,
  },
  products: { collection: 'beautyProducts', permission: 'beautyInventory', branchRequired: true },
  'inventory-transactions': {
    collection: 'beautyInventoryTransactions',
    permission: 'beautyInventory',
    branchRequired: true,
  },
  suppliers: { collection: 'beautySuppliers', permission: 'beautyInventory', branchRequired: true },
  commissions: {
    collection: 'beautyCommissions',
    permission: 'beautyCommissions',
    branchRequired: true,
  },
  campaigns: { collection: 'beautyCampaigns', permission: 'beautyCampaigns', branchRequired: true },
  'campaign-logs': {
    collection: 'beautyCampaignLogs',
    permission: 'beautyCampaigns',
    branchRequired: true,
  },
  notifications: {
    collection: 'beautyNotifications',
    permission: 'beautyCampaigns',
    branchRequired: true,
  },
  waitlist: {
    collection: 'beautyWaitlist',
    permission: 'beautyAppointments',
    branchRequired: true,
  },
  media: { collection: 'beautyMedia', permission: 'beautyHealth', branchRequired: true },
  settings: { collection: 'beautySettings', permission: 'beautySettings' },
  'audit-logs': { collection: 'beautyAuditLogs', permission: 'beautyAudit' },
  reviews: { collection: 'beautyReviews', permission: 'beautyCampaigns', branchRequired: true },
};

@Injectable()
export class BeautyStore {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly context: TenantContext,
  ) {}
  get db() {
    return this.firebase.db;
  }
  tenantId(): string {
    return this.context.getTenantId();
  }
  actor() {
    return this.context.getStore();
  }
  collection(name: string) {
    return this.db.collection(tenantCollectionPath(this.tenantId(), name));
  }
  doc(name: string, id: string) {
    return this.collection(name).doc(id);
  }
  newDoc(name: string) {
    return this.collection(name).doc();
  }
  runTransaction<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.db.runTransaction(work);
  }

  config(resource: string): ResourceConfig {
    const config = BEAUTY_RESOURCES[resource];
    if (!config) throw new BadRequestException('Desteklenmeyen beauty kaynagi.');
    return config;
  }

  assertPermission(resource: string, action: PermissionAction): ResourceConfig {
    const config = this.config(resource);
    const actor = this.actor();
    if (actor.role !== 'owner' && !hasPermission(actor.permissions, config.permission, action)) {
      throw new ForbiddenException('Bu islem icin yetkiniz yok.');
    }
    return config;
  }

  async list(
    resource: string,
    query: { branchId?: string; status?: string; search?: string; limit?: number },
  ) {
    const config = this.assertPermission(resource, 'view');
    let ref: Query = this.collection(config.collection);
    const scope = await this.scopeConstraint(resource);
    if (scope) ref = ref.where(scope.field, '==', scope.value);
    if (query.branchId) ref = ref.where('branchId', '==', query.branchId);
    else if (query.status) ref = ref.where('status', '==', query.status);
    ref = ref.limit(Math.min(query.limit ?? 50, 200));
    const snapshot = await ref.get();
    const needle = query.search?.trim().toLocaleLowerCase('tr');
    return snapshot.docs
      .map((item) => ({ id: item.id, ...item.data() }) as BeautyDoc)
      .filter((item) => !isDeleted(item))
      .filter((item) => !query.status || item['status'] === query.status)
      .filter((item) => !needle || JSON.stringify(item).toLocaleLowerCase('tr').includes(needle));
  }

  async get(resource: string, id: string): Promise<BeautyDoc> {
    const config = this.assertPermission(resource, 'view');
    const snapshot = await this.doc(config.collection, id).get();
    if (!snapshot.exists || isDeleted(snapshot.data() as BeautyDoc))
      throw new NotFoundException('Kayit bulunamadi.');
    const document = { id: snapshot.id, ...snapshot.data() } as BeautyDoc;
    await this.assertDocumentScope(resource, document);
    return document;
  }

  async create(
    resource: string,
    data: Record<string, unknown>,
    branchId: string | undefined,
    meta: AuditMeta = {},
  ) {
    const config = this.assertPermission(resource, 'create');
    const resolvedBranch =
      branchId ?? (typeof data['branchId'] === 'string' ? data['branchId'] : undefined);
    if (config.branchRequired && !resolvedBranch)
      throw new BadRequestException('branchId zorunludur.');
    const ref = this.newDoc(config.collection);
    const actor = this.actor();
    await this.assertCreateScope(resource, data);
    const document = {
      ...createBaseFields(ref.id, actor.userId),
      ...omitUndefined(data),
      ...(resolvedBranch ? { branchId: resolvedBranch } : {}),
    };
    await ref.set(document);
    await this.audit(resource, 'create', ref.id, null, document, {
      ...meta,
      branchId: resolvedBranch,
    });
    return document;
  }

  async update(resource: string, id: string, data: Record<string, unknown>, meta: AuditMeta = {}) {
    const config = this.assertPermission(resource, 'update');
    const current = await this.get(resource, id);
    const patch = { ...omitUndefined(data), ...touchBaseFields(this.actor().userId) };
    await this.doc(config.collection, id).update(patch);
    const updated = { ...current, ...patch } as BeautyDoc;
    await this.audit(resource, 'update', id, current, updated, {
      ...meta,
      branchId: String(updated['branchId'] ?? ''),
    });
    return updated;
  }

  async remove(resource: string, id: string, meta: AuditMeta = {}) {
    const config = this.assertPermission(resource, 'delete');
    const current = await this.get(resource, id);
    const patch = { deletedAt: new Date().toISOString(), ...touchBaseFields(this.actor().userId) };
    await this.doc(config.collection, id).update(patch);
    await this.audit(resource, 'delete', id, current, null, {
      ...meta,
      branchId: String(current['branchId'] ?? ''),
    });
    return { id };
  }

  async audit(
    entityType: string,
    action: string,
    entityId: string,
    before: unknown,
    after: unknown,
    meta: AuditMeta = {},
  ) {
    const actor = this.actor();
    const ref = this.newDoc('beautyAuditLogs');
    await ref.set({
      id: ref.id,
      entityType,
      entityId,
      action,
      before,
      after,
      userId: actor.userId,
      userRole: actor.role,
      ip: meta.ip ?? '',
      userAgent: meta.userAgent ?? '',
      requestId: meta.requestId ?? '',
      branchId: meta.branchId ?? '',
      createdAt: new Date().toISOString(),
    });
  }

  private beautyRole(): string | null {
    const actor = this.actor();
    if (actor.role === 'owner') return 'owner';
    return actor.roleIds?.find((id) => id.startsWith('beauty-'))?.slice('beauty-'.length) ?? null;
  }

  private async linkedId(collection: 'beautyCustomers' | 'beautyStaff'): Promise<string | null> {
    const snapshot = await this.collection(collection)
      .where('userId', '==', this.actor().userId)
      .limit(1)
      .get();
    return snapshot.empty ? null : snapshot.docs[0].id;
  }

  private async scopeConstraint(
    resource: string,
  ): Promise<{ field: string; value: string } | null> {
    const role = this.beautyRole();
    if (role === 'customer') {
      const customerId = await this.linkedId('beautyCustomers');
      if (!customerId)
        throw new ForbiddenException('Musteri hesabi bir musteri kartina bagli degil.');
      if (resource === 'customers') return { field: 'userId', value: this.actor().userId };
      if (
        [
          'health',
          'skin-analyses',
          'consents',
          'appointments',
          'sessions',
          'customer-packages',
          'reviews',
        ].includes(resource)
      ) {
        return { field: 'customerId', value: customerId };
      }
    }
    if (role === 'specialist') {
      const staffId = await this.linkedId('beautyStaff');
      if (!staffId) throw new ForbiddenException('Uzman hesabi bir personel kartina bagli degil.');
      if (resource === 'staff') return { field: 'userId', value: this.actor().userId };
      if (['appointments', 'sessions', 'commissions', 'shifts', 'time-off'].includes(resource)) {
        return { field: 'staffId', value: staffId };
      }
    }
    return null;
  }

  private async assertDocumentScope(resource: string, document: BeautyDoc): Promise<void> {
    const scope = await this.scopeConstraint(resource);
    if (scope && document[scope.field] !== scope.value) {
      throw new ForbiddenException('Bu kayda erisim yetkiniz yok.');
    }
  }

  private async assertCreateScope(resource: string, data: Record<string, unknown>): Promise<void> {
    const scope = await this.scopeConstraint(resource);
    if (scope && data[scope.field] !== scope.value) {
      throw new ForbiddenException('Baska bir kullanici adina kayit olusturamazsiniz.');
    }
  }
}
