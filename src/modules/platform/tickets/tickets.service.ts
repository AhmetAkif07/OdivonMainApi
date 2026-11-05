import { randomInt } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { FirebaseService } from '../../../shared/firebase/firebase.service';
import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { ROOT_COLLECTION } from '../../../shared/firebase/firestore-path';
import { TenantDocument } from '../../tenant/entities/tenant.entity';
import { SupportTicket, TicketGroup, TicketStatus } from './tickets.entity';
import { CreateSupportTicketDto, UpdateTicketStatusDto } from './dto';
import {
  PRODUCT_LABELS,
  UNKNOWN_GROUP,
  groupTicketsByProduct,
  groupTicketsByTenant,
  resolveTicketProduct,
} from './ticket-grouping';

const COLLECTION_NAME = 'supportTickets';

const CATEGORY_NAMES: Record<string, string> = {
  technical_support: 'Teknik Destek',
  membership_freeze: 'Üyelik & Dondurma',
  turnstile_access: 'Turnike & Geçiş',
  billing_payment: 'Ödeme & Fatura',
  feature_request: 'Öneri & İstek',
  general_inquiry: 'Genel Soru',
  complaint_suggestion: 'Şikayet & Bildirim',
};

@Injectable()
export class PlatformTicketsService {
  private readonly logger = new Logger(PlatformTicketsService.name);

  constructor(private readonly firebase: FirebaseService) {}

  /**
   * Tracking code like TK-2026-7KQ2M9XH4D: 10 characters from a 31-letter alphabet (~49 bits), drawn
   * with crypto randomness, so codes cannot be guessed or enumerated.
   */
  private generateTrackingNumber(): string {
    const year = new Date().getFullYear();
    let code = '';
    for (let i = 0; i < 10; i++) code += TRACKING_ALPHABET[randomInt(TRACKING_ALPHABET.length)];
    return `TK-${year}-${code}`;
  }

  async createTicket(
    dto: CreateSupportTicketDto,
    authContext?: { uid?: string; tenantId?: string; role?: string; modules?: string[] },
  ): Promise<SupportTicket> {
    const trackingNumber = this.generateTrackingNumber();
    const now = new Date().toISOString();

    // A signed-in user's tenant comes from their token, not from the form.
    const tenantId = authContext?.tenantId || dto.tenantId || null;
    const tenant = tenantId ? (await this.loadTenants([tenantId])).get(tenantId) : undefined;
    const product = resolveTicketProduct(dto.product, authContext?.modules, tenant?.modules);

    const categoryLabel =
      dto.categoryLabel || CATEGORY_NAMES[dto.category] || dto.category;

    const ticket: Omit<SupportTicket, 'id'> = {
      trackingNumber,
      tenantId,
      tenantName: tenant?.name || dto.tenantName?.trim() || null,
      product,
      productLabel: product ? PRODUCT_LABELS[product] : null,
      userId: authContext?.uid || null,
      userRole: authContext?.role || null,
      category: dto.category,
      categoryLabel,
      subject: dto.subject.trim(),
      description: dto.description.trim(),
      fullName: dto.fullName.trim(),
      email: dto.email.trim().toLowerCase(),
      phone: dto.phone?.trim() || null,
      priority: dto.priority || 'normal',
      status: 'pending',
      adminNote: null,
      approvedAt: null,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    // Store with document ID = trackingNumber for fast, direct O(1) lookups
    const docRef = this.firebase.db.collection(COLLECTION_NAME).doc(trackingNumber);
    // create(), not set(): a colliding code must never overwrite someone else's ticket.
    await docRef.create(ticket);
    this.logger.log(`Support ticket created: ${trackingNumber} by ${ticket.email}`);

    return {
      id: trackingNumber,
      ...ticket,
    };
  }

  /**
   * Anonymous status lookup by tracking code. Returns only the ticket's progress, never the
   * requester's contact details, description or the admin note.
   */
  async trackTicket(trackingNumber: string): Promise<PublicTicketStatus> {
    const cleanNo = trackingNumber.trim().toUpperCase();
    if (!/^TK-\d{4}-[A-Z0-9]{6,12}$/.test(cleanNo)) {
      throw new AppException(ErrorCode.CRM_NOT_FOUND, 'Belirtilen takip numarasına ait talep bulunamadı.');
    }
    const doc = await this.firebase.db.collection(COLLECTION_NAME).doc(cleanNo).get();

    if (!doc.exists) {
      throw new AppException(ErrorCode.CRM_NOT_FOUND, 'Belirtilen takip numarasına ait talep bulunamadı.');
    }

    return toPublicTicketStatus(doc.id, doc.data() as Omit<SupportTicket, 'id'>);
  }

  /** Signed-in user's tickets: by uid, plus tickets sent from their verified e-mail address. */
  async getMyTickets(email?: string, userId?: string): Promise<SupportTicket[]> {
    if (!userId) return [];
    const collection = this.firebase.db.collection(COLLECTION_NAME);
    const cleanEmail = email?.trim().toLowerCase();
    const [byUser, byEmail] = await Promise.all([
      collection.where('userId', '==', userId).get(),
      cleanEmail ? collection.where('email', '==', cleanEmail).get() : Promise.resolve(null),
    ]);
    const tickets = new Map<string, SupportTicket>();
    for (const doc of [...byUser.docs, ...(byEmail?.docs ?? [])]) {
      tickets.set(doc.id, { id: doc.id, ...(doc.data() as Omit<SupportTicket, 'id'>) });
    }
    return [...tickets.values()].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  /** Reads tenant docs in one round trip (one subrequest per 100 ids). */
  private async loadTenants(ids: string[]): Promise<Map<string, TenantDocument>> {
    const unique = [...new Set(ids.filter(Boolean))];
    const out = new Map<string, TenantDocument>();
    const col = this.firebase.db.collection(ROOT_COLLECTION.tenants);
    for (let i = 0; i < unique.length; i += 100) {
      const chunk = unique.slice(i, i + 100);
      try {
        const snaps = await this.firebase.db.getAll(...chunk.map((id) => col.doc(id)));
        snaps.forEach((snap) => {
          if (snap.exists) out.set(snap.id, snap.data() as TenantDocument);
        });
      } catch (err) {
        this.logger.warn(`Ticket tenant lookup failed: ${(err as Error).message}`);
      }
    }
    return out;
  }

  /** Fills product and tenant name on tickets saved before those fields existed. */
  private async enrichTickets(tickets: SupportTicket[]): Promise<SupportTicket[]> {
    const needs = tickets.filter((t) => t.tenantId && (!t.product || !t.tenantName));
    const tenants = needs.length ? await this.loadTenants(needs.map((t) => t.tenantId as string)) : new Map();
    return tickets.map((t) => {
      const tenant = t.tenantId ? tenants.get(t.tenantId) : undefined;
      const product = t.product || resolveTicketProduct(null, tenant?.modules);
      return {
        ...t,
        tenantName: t.tenantName || tenant?.name || null,
        product: product ?? null,
        productLabel: product ? t.productLabel || PRODUCT_LABELS[product] : null,
      };
    });
  }

  async listPlatformTickets(params: {
    status?: string;
    search?: string;
    product?: string;
    tenantId?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{
    items: SupportTicket[];
    total: number;
    page: number;
    pageSize: number;
    counts: Record<TicketStatus | 'all', number>;
    groups: { products: TicketGroup[]; tenants: TicketGroup[] };
  }> {
    const snapshot = await this.firebase.db.collection(COLLECTION_NAME).get();
    let all: SupportTicket[] = [];

    snapshot.forEach((doc) => {
      all.push({ id: doc.id, ...(doc.data() as Omit<SupportTicket, 'id'>) });
    });
    all = await this.enrichTickets(all);

    all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const counts: Record<TicketStatus | 'all', number> = {
      all: all.length,
      pending: all.filter((t) => t.status === 'pending').length,
      in_progress: all.filter((t) => t.status === 'in_progress').length,
      approved: all.filter((t) => t.status === 'approved').length,
      completed: all.filter((t) => t.status === 'completed').length,
      rejected: all.filter((t) => t.status === 'rejected').length,
    };

    if (params.status && params.status !== 'all') {
      all = all.filter((t) => t.status === params.status);
    }

    if (params.search) {
      const q = params.search.trim().toLowerCase();
      all = all.filter(
        (t) =>
          t.trackingNumber?.toLowerCase().includes(q) ||
          t.fullName?.toLowerCase().includes(q) ||
          t.email?.toLowerCase().includes(q) ||
          t.subject?.toLowerCase().includes(q) ||
          t.tenantName?.toLowerCase().includes(q) ||
          t.tenantId?.toLowerCase().includes(q) ||
          t.productLabel?.toLowerCase().includes(q),
      );
    }

    // Group totals follow the status + search filters, not the product/tenant pick itself.
    const groups = { products: groupTicketsByProduct(all), tenants: groupTicketsByTenant(all) };

    if (params.product && params.product !== 'all') {
      const p = params.product;
      all = all.filter((t) => (p === UNKNOWN_GROUP ? !t.product : t.product === p));
    }
    if (params.tenantId && params.tenantId !== 'all') {
      const id = params.tenantId;
      all = all.filter((t) => (id === UNKNOWN_GROUP ? !t.tenantId : t.tenantId === id));
    }

    const page = Math.max(1, Number(params.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(params.pageSize) || 20));
    const start = (page - 1) * pageSize;
    const items = all.slice(start, start + pageSize);

    return {
      items,
      total: all.length,
      page,
      pageSize,
      counts,
      groups,
    };
  }

  async getPlatformTicketById(id: string): Promise<SupportTicket> {
    const cleanId = id.trim().toUpperCase();
    const doc = await this.firebase.db.collection(COLLECTION_NAME).doc(cleanId).get();
    if (!doc.exists) {
      throw new AppException(ErrorCode.CRM_NOT_FOUND, 'Talep kaydı bulunamadı.');
    }
    const [ticket] = await this.enrichTickets([{ id: doc.id, ...(doc.data() as Omit<SupportTicket, 'id'>) }]);
    return ticket;
  }

  async updatePlatformTicket(
    id: string,
    dto: UpdateTicketStatusDto,
  ): Promise<SupportTicket> {
    const cleanId = id.trim().toUpperCase();
    const docRef = this.firebase.db.collection(COLLECTION_NAME).doc(cleanId);
    const doc = await docRef.get();
    if (!doc.exists) {
      throw new AppException(ErrorCode.CRM_NOT_FOUND, 'Talep kaydı bulunamadı.');
    }

    const now = new Date().toISOString();
    const patch: Partial<SupportTicket> = {
      status: dto.status,
      updatedAt: now,
    };

    if (dto.adminNote !== undefined) {
      patch.adminNote = dto.adminNote?.trim() || null;
    }
    if (dto.priority !== undefined) {
      patch.priority = dto.priority;
    }
    if (dto.product !== undefined) {
      patch.product = dto.product;
      patch.productLabel = PRODUCT_LABELS[dto.product];
    }
    if (dto.status === 'approved' || dto.status === 'in_progress') {
      patch.approvedAt = (doc.data() as any)?.approvedAt || now;
    }
    if (dto.status === 'completed') {
      patch.completedAt = now;
    }

    await docRef.update(patch);
    this.logger.log(`Support ticket ${cleanId} updated to ${dto.status}`);

    const updated = await docRef.get();
    const [ticket] = await this.enrichTickets([{ id: updated.id, ...(updated.data() as Omit<SupportTicket, 'id'>) }]);
    return ticket;
  }
}

/** No 0/O, 1/I/L: codes are read and typed by people. */
const TRACKING_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export interface PublicTicketStatus {
  id: string;
  trackingNumber: string;
  productLabel: string | null;
  categoryLabel: string;
  subject: string;
  status: SupportTicket['status'];
  approvedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export function toPublicTicketStatus(id: string, data: Omit<SupportTicket, 'id'>): PublicTicketStatus {
  return {
    id,
    trackingNumber: data.trackingNumber ?? id,
    productLabel: data.productLabel ?? null,
    categoryLabel: data.categoryLabel,
    subject: data.subject,
    status: data.status,
    approvedAt: data.approvedAt ?? null,
    completedAt: data.completedAt ?? null,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
}
