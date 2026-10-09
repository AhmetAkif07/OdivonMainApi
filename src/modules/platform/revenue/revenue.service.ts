import { randomUUID } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { FirebaseService } from '../../../shared/firebase/firebase.service';
import { ROOT_COLLECTION } from '../../../shared/firebase/firestore-path';
import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { TenantDocument } from '../../tenant/entities/tenant.entity';
import { nextPeriod, receiptNo, SaasCycle } from '../../payments/saas-billing';
import { PlatformAuditService } from '../audit/platform-audit.service';
import { PlatformAdminUser } from '../platform-admin.guard';
import { RecordManualPaymentDto, RevenueQueryDto } from './dto';

export interface SaasPaymentDocument {
  id: string;
  receiptNo: string;
  planId: string;
  billingCycle: 'monthly' | 'yearly';
  amountKurus: number;
  currency: 'TRY';
  mode: 'sandbox' | 'live' | 'manual';
  periodStartsAt: string;
  periodEndsAt: string;
  paidAt: string;
  tenantId?: string;
  recordedBy?: string;
  notes?: string | null;
}

@Injectable()
export class PlatformRevenueService {
  private readonly logger = new Logger(PlatformRevenueService.name);

  constructor(
    private readonly firebase: FirebaseService,
    private readonly audit: PlatformAuditService,
  ) {}

  async getRevenueStats(query: RevenueQueryDto) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));

    // Default mode: hide sandbox unless explicitly specified
    let allowedModes: string[] = ['live', 'manual'];
    if (query.mode) {
      if (query.mode === 'all') {
        allowedModes = ['live', 'manual', 'sandbox'];
      } else {
        allowedModes = query.mode.split(',').map((m) => m.trim().toLowerCase());
      }
    }

    // Query collectionGroup 'saasPayments'
    const snapshot = await this.firebase.db.collectionGroup('saasPayments').get();

    // Extract payments with tenantId from doc path
    let allPayments = snapshot.docs.map((doc) => {
      const data = doc.data() as SaasPaymentDocument;
      // Path format: tenants/{tenantId}/saasPayments/{id}
      const tenantId = doc.ref.parent.parent?.id || data.tenantId || 'unknown';
      return {
        ...data,
        tenantId,
      };
    });

    // Filter by allowed modes
    allPayments = allPayments.filter((p) => allowedModes.includes(p.mode ?? 'sandbox'));

    // Filter by date range
    if (query.from) {
      allPayments = allPayments.filter((p) => p.paidAt >= query.from!);
    }
    if (query.to) {
      allPayments = allPayments.filter((p) => p.paidAt <= query.to!);
    }

    // Load tenants map for names and modules
    const uniqueTenantIds = [...new Set(allPayments.map((p) => p.tenantId))];
    const tenantMap = new Map<string, { name: string; modules: string[] }>();

    if (uniqueTenantIds.length > 0) {
      // Chunk by 30 for Firestore getAll
      for (let i = 0; i < uniqueTenantIds.length; i += 30) {
        const chunk = uniqueTenantIds.slice(i, i + 30);
        const refs = chunk.map((id) => this.firebase.db.collection(ROOT_COLLECTION.tenants).doc(id));
        const snaps = await this.firebase.db.getAll(...refs);
        snaps.forEach((s) => {
          if (s.exists) {
            const t = s.data() as TenantDocument;
            tenantMap.set(s.id, { name: t.name, modules: t.modules || [] });
          }
        });
      }
    }

    // Filter by module if specified
    if (query.module && query.module !== 'all') {
      const targetModule = query.module.toLowerCase();
      allPayments = allPayments.filter((p) => {
        const t = tenantMap.get(p.tenantId);
        return t?.modules?.includes(targetModule);
      });
    }

    // Sort by paidAt desc
    allPayments.sort((a, b) => (b.paidAt || '').localeCompare(a.paidAt || ''));

    // Calculate aggregated metrics
    let totalKurus = 0;
    const monthlyMap = new Map<string, { amountKurus: number; count: number }>();
    const moduleMap = new Map<string, { amountKurus: number; count: number }>();
    const planMap = new Map<string, { amountKurus: number; count: number }>();

    for (const p of allPayments) {
      const kurus = p.amountKurus || 0;
      totalKurus += kurus;

      // Month: YYYY-MM
      const month = p.paidAt ? p.paidAt.slice(0, 7) : 'Unknown';
      const mEntry = monthlyMap.get(month) || { amountKurus: 0, count: 0 };
      mEntry.amountKurus += kurus;
      mEntry.count += 1;
      monthlyMap.set(month, mEntry);

      // Module
      const tInfo = tenantMap.get(p.tenantId);
      const mod = tInfo?.modules?.[0] || 'other';
      const modEntry = moduleMap.get(mod) || { amountKurus: 0, count: 0 };
      modEntry.amountKurus += kurus;
      modEntry.count += 1;
      moduleMap.set(mod, modEntry);

      // Plan
      const plan = p.planId || 'unknown';
      const planEntry = planMap.get(plan) || { amountKurus: 0, count: 0 };
      planEntry.amountKurus += kurus;
      planEntry.count += 1;
      planMap.set(plan, planEntry);
    }

    const monthlyBreakdown = Array.from(monthlyMap.entries())
      .map(([month, val]) => ({
        month,
        amountTRY: Math.round(val.amountKurus / 100),
        count: val.count,
      }))
      .sort((a, b) => a.month.localeCompare(b.month));

    const moduleBreakdown = Array.from(moduleMap.entries()).map(([module, val]) => ({
      module,
      amountTRY: Math.round(val.amountKurus / 100),
      count: val.count,
    }));

    const planBreakdown = Array.from(planMap.entries()).map(([planId, val]) => ({
      planId,
      amountTRY: Math.round(val.amountKurus / 100),
      count: val.count,
    }));

    // Pagination for payment items
    const total = allPayments.length;
    const offset = (page - 1) * pageSize;
    const pagedPayments = allPayments.slice(offset, offset + pageSize).map((p) => {
      const t = tenantMap.get(p.tenantId);
      return {
        ...p,
        amountTRY: (p.amountKurus || 0) / 100,
        tenantName: t?.name || p.tenantId,
        tenantModule: t?.modules?.[0] || 'gym',
      };
    });

    return {
      summary: {
        totalRevenueTRY: Math.round(totalKurus / 100),
        totalTransactions: total,
      },
      monthlyBreakdown,
      moduleBreakdown,
      planBreakdown,
      payments: pagedPayments,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async recordManualPayment(tenantId: string, dto: RecordManualPaymentDto, admin: PlatformAdminUser) {
    const tenantRef = this.firebase.db.doc(`${ROOT_COLLECTION.tenants}/${tenantId}`);
    const tenantSnap = await tenantRef.get();
    if (!tenantSnap.exists) {
      throw new AppException(ErrorCode.TENANT_NOT_FOUND, 'Tenant not found');
    }
    const tenantData = tenantSnap.data() as TenantDocument;
    const paidAt = new Date().toISOString();

    const currentEnd =
      tenantData.membershipStatus === 'active' ? tenantData.subscriptionEndsAt : null;
    const period = nextPeriod(currentEnd, dto.billingCycle as SaasCycle, new Date(paidAt));
    const sessionId = randomUUID();
    const recNo = receiptNo(sessionId, paidAt);

    const paymentRecord: SaasPaymentDocument = {
      id: sessionId,
      receiptNo: recNo,
      planId: dto.planId,
      billingCycle: dto.billingCycle,
      amountKurus: Math.round(dto.amountTRY * 100),
      currency: 'TRY',
      mode: 'manual',
      periodStartsAt: period.startsAt,
      periodEndsAt: period.endsAt,
      paidAt,
      tenantId,
      recordedBy: admin.uid,
      notes: dto.notes ?? null,
    };

    const cleanPayment = Object.fromEntries(
      Object.entries(paymentRecord).filter(([, val]) => val !== undefined),
    );

    const batch = this.firebase.db.batch();
    const paymentDocRef = this.firebase.db.doc(`tenants/${tenantId}/saasPayments/${sessionId}`);
    batch.set(paymentDocRef, cleanPayment);

    // Update tenant subscription status
    batch.update(tenantRef, {
      membershipStatus: 'active',
      planId: dto.planId,
      billingCycle: dto.billingCycle,
      subscriptionEndsAt: period.endsAt,
      updatedAt: paidAt,
    });

    await batch.commit();

    await this.audit.record({
      adminUid: admin.uid,
      adminEmail: admin.email,
      action: 'MANUAL_PAYMENT_RECORDED',
      targetType: 'payment',
      tenantId,
      targetId: sessionId,
      after: {
        receiptNo: recNo,
        amountTRY: dto.amountTRY,
        planId: dto.planId,
        billingCycle: dto.billingCycle,
        newSubscriptionEndsAt: period.endsAt,
      },
      reason: dto.notes,
    });

    return {
      success: true,
      receiptNo: recNo,
      amountTRY: dto.amountTRY,
      subscriptionEndsAt: period.endsAt,
      paidAt,
    };
  }
}
