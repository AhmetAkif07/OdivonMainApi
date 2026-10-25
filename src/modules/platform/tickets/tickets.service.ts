import { Injectable, Logger } from '@nestjs/common';
import { FirebaseService } from '../../../shared/firebase/firebase.service';
import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { SupportTicket, TicketStatus } from './tickets.entity';
import { CreateSupportTicketDto, UpdateTicketStatusDto } from './dto';

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
   * Generates a unique, friendly tracking code (e.g., TK-2026-482910)
   */
  private generateTrackingNumber(): string {
    const year = new Date().getFullYear();
    const rand = Math.floor(100000 + Math.random() * 900000);
    return `TK-${year}-${rand}`;
  }

  async createTicket(
    dto: CreateSupportTicketDto,
    authContext?: { uid?: string; tenantId?: string; role?: string },
  ): Promise<SupportTicket> {
    const trackingNumber = this.generateTrackingNumber();
    const now = new Date().toISOString();

    const categoryLabel =
      dto.categoryLabel || CATEGORY_NAMES[dto.category] || dto.category;

    const ticket: Omit<SupportTicket, 'id'> = {
      trackingNumber,
      // A signed-in user's tenant comes from their token, not from the form.
      tenantId: authContext?.tenantId || dto.tenantId || null,
      tenantName: dto.tenantName || null,
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
    await docRef.set(ticket);
    this.logger.log(`Support ticket created: ${trackingNumber} by ${ticket.email}`);

    return {
      id: trackingNumber,
      ...ticket,
    };
  }

  async trackTicket(trackingNumber: string): Promise<SupportTicket> {
    const cleanNo = trackingNumber.trim().toUpperCase();
    const doc = await this.firebase.db.collection(COLLECTION_NAME).doc(cleanNo).get();

    if (!doc.exists) {
      throw new AppException(ErrorCode.CRM_NOT_FOUND, 'Belirtilen takip numarasına ait talep bulunamadı.');
    }

    return {
      id: doc.id,
      ...(doc.data() as Omit<SupportTicket, 'id'>),
    };
  }

  async getMyTickets(email?: string, userId?: string): Promise<SupportTicket[]> {
    if (!email && !userId) return [];

    const snapshot = await this.firebase.db.collection(COLLECTION_NAME).get();
    const list: SupportTicket[] = [];

    const cleanEmail = email?.trim().toLowerCase();
    snapshot.forEach((doc) => {
      const data = doc.data() as Omit<SupportTicket, 'id'>;
      if ((cleanEmail && data.email === cleanEmail) || (userId && data.userId === userId)) {
        list.push({ id: doc.id, ...data });
      }
    });

    return list.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  async listPlatformTickets(params: {
    status?: string;
    search?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{
    items: SupportTicket[];
    total: number;
    page: number;
    pageSize: number;
    counts: Record<TicketStatus | 'all', number>;
  }> {
    const snapshot = await this.firebase.db.collection(COLLECTION_NAME).get();
    let all: SupportTicket[] = [];

    snapshot.forEach((doc) => {
      all.push({ id: doc.id, ...(doc.data() as Omit<SupportTicket, 'id'>) });
    });

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
          t.tenantName?.toLowerCase().includes(q),
      );
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
    };
  }

  async getPlatformTicketById(id: string): Promise<SupportTicket> {
    const cleanId = id.trim().toUpperCase();
    const doc = await this.firebase.db.collection(COLLECTION_NAME).doc(cleanId).get();
    if (!doc.exists) {
      throw new AppException(ErrorCode.CRM_NOT_FOUND, 'Talep kaydı bulunamadı.');
    }
    return {
      id: doc.id,
      ...(doc.data() as Omit<SupportTicket, 'id'>),
    };
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
    if (dto.status === 'approved' || dto.status === 'in_progress') {
      patch.approvedAt = (doc.data() as any)?.approvedAt || now;
    }
    if (dto.status === 'completed') {
      patch.completedAt = now;
    }

    await docRef.update(patch);
    this.logger.log(`Support ticket ${cleanId} updated to ${dto.status}`);

    const updated = await docRef.get();
    return {
      id: updated.id,
      ...(updated.data() as Omit<SupportTicket, 'id'>),
    };
  }
}
