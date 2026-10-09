import { Injectable } from '@nestjs/common';
import { FirebaseService } from '../../../shared/firebase/firebase.service';
import { ROOT_COLLECTION } from '../../../shared/firebase/firestore-path';
import { TenantDocument } from '../../tenant/entities/tenant.entity';
import { computeTenantStatus } from '../shared/subscription-math';
import { PlatformRevenueService } from '../revenue/revenue.service';
import { PlatformErrorLogsService } from '../logs/error-logs.service';
import { addDaysToDate, daysDifference } from '../shared/subscription-math';
import { DEMO_SUSPEND_AFTER_DAYS } from '../demos/demo-policy';

export interface ExpiringSoonTenant {
  id: string;
  name: string;
  module: string;
  daysLeft: number;
  endsAt: string | null;
  membershipStatus?: string;
  isDemo: boolean;
}

export interface DemoNearSuspensionTenant {
  id: string;
  name: string;
  module: string;
  daysLeftToSuspend: number;
  trialEndsAt: string;
}

@Injectable()
export class PlatformDashboardService {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly revenueService: PlatformRevenueService,
    private readonly errorLogsService: PlatformErrorLogsService,
  ) {}

  async getDashboardStats() {
    const now = new Date();
    const tenantsSnap = await this.firebase.db.collection(ROOT_COLLECTION.tenants).get();
    const tenants = tenantsSnap.docs
      .map((d) => d.data() as TenantDocument)
      .filter((t) => !t.deletedAt);

    let activeCount = 0;
    let trialCount = 0;
    let expiredCount = 0;
    let suspendedCount = 0;
    let demoCount = 0;

    const moduleCounts: Record<string, number> = {
      gym: 0,
      vet: 0,
      farm: 0,
      other: 0,
    };

    const expiringSoon: ExpiringSoonTenant[] = [];
    const demosNearSuspension: DemoNearSuspensionTenant[] = [];

    for (const t of tenants) {
      const state = computeTenantStatus(t, now);

      // Status counters
      if (state.computedStatus === 'active') activeCount++;
      else if (state.computedStatus === 'trial') trialCount++;
      else if (state.computedStatus === 'expired') expiredCount++;
      else if (state.computedStatus === 'suspended') suspendedCount++;

      if (t.isDemo) demoCount++;

      // Module counters
      const primaryModule = t.modules?.[0];
      if (primaryModule === 'gym' || primaryModule === 'vet' || primaryModule === 'farm') {
        moduleCounts[primaryModule]++;
      } else {
        moduleCounts.other++;
      }

      // Expiring in next 7 days (not yet expired, daysLeft between 0 and 7)
      if (state.daysLeft !== null && state.daysLeft >= 0 && state.daysLeft <= 7 && !state.isSuspended) {
        expiringSoon.push({
          id: t.id,
          name: t.name,
          module: primaryModule || 'gym',
          daysLeft: state.daysLeft,
          endsAt: state.effectiveEndsAt,
          membershipStatus: t.membershipStatus,
          isDemo: Boolean(t.isDemo),
        });
      }

      // Demos about to be auto-suspended (expired, suspended in <= 3 days)
      if (t.isDemo && state.computedStatus === 'expired' && t.trialEndsAt) {
        const suspendDeadline = addDaysToDate(new Date(t.trialEndsAt), DEMO_SUSPEND_AFTER_DAYS);
        const daysLeftToSuspend = Math.max(0, daysDifference(suspendDeadline.toISOString(), now) || 0);
        demosNearSuspension.push({
          id: t.id,
          name: t.name,
          module: primaryModule || 'gym',
          daysLeftToSuspend,
          trialEndsAt: t.trialEndsAt,
        });
      }
    }

    // Sort expiring soon by daysLeft asc
    expiringSoon.sort((a, b) => a.daysLeft - b.daysLeft);
    demosNearSuspension.sort((a, b) => a.daysLeftToSuspend - b.daysLeftToSuspend);

    // Revenue metrics (current month)
    const revenueStats = await this.revenueService.getRevenueStats({});
    const currentMonthKey = now.toISOString().slice(0, 7);
    const thisMonthRevenue = revenueStats.monthlyBreakdown.find((m) => m.month === currentMonthKey) || {
      amountTRY: 0,
      count: 0,
    };

    // Error metrics (last 24 hours)
    const errorSummary = await this.errorLogsService.getSummary(24);

    return {
      tenants: {
        total: tenants.length,
        active: activeCount,
        trial: trialCount,
        expired: expiredCount,
        suspended: suspendedCount,
        demos: demoCount,
        modules: moduleCounts,
      },
      revenue: {
        thisMonthTRY: thisMonthRevenue.amountTRY,
        thisMonthTransactions: thisMonthRevenue.count,
        totalRevenueTRY: revenueStats.summary.totalRevenueTRY,
        monthlyTrend: revenueStats.monthlyBreakdown.slice(-12),
      },
      errors: {
        last24hCount: errorSummary.totalErrors,
        topPaths: errorSummary.topPaths.slice(0, 5),
      },
      expiringSoon: expiringSoon.slice(0, 10),
      demosNearSuspension: demosNearSuspension.slice(0, 10),
    };
  }
}
