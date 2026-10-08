import { Injectable } from '@nestjs/common';
import { FirebaseService } from '../../shared/firebase/firebase.service';
import { TENANT_COLLECTION, tenantCollectionPath } from '../../shared/firebase/firestore-path';
import { TenantContext } from '../../shared/tenancy/tenant.context';

export interface ApmAppointment {
  id: string;
  title: string;
  customerName: string;
  staffName: string;
  startAt: string;
  endAt: string;
  status: 'Pending' | 'Confirmed' | 'InProgress' | 'Completed' | 'Cancelled';
}

@Injectable()
export class ApmService {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly tenantContext: TenantContext,
  ) {}

  async appointments(from?: string, to?: string): Promise<ApmAppointment[]> {
    const tenantId = this.tenantContext.getTenantId();
    let query = this.firebase.db
      .collection(tenantCollectionPath(tenantId, TENANT_COLLECTION.apmAppointments))
      .orderBy('startAt', 'asc');
    if (from) query = query.where('startAt', '>=', from);
    if (to) query = query.where('startAt', '<', to);
    const snapshot = await query.get();
    return snapshot.docs
      .map((doc) => ({ id: doc.id, ...(doc.data() as Omit<ApmAppointment, 'id'>) }))
      .filter((appointment) => !('deletedAt' in appointment));
  }

  async dashboard(): Promise<{ appointments: ApmAppointment[]; counts: Record<string, number> }> {
    const appointments = await this.appointments();
    const counts = appointments.reduce<Record<string, number>>((acc, appointment) => {
      acc[appointment.status] = (acc[appointment.status] ?? 0) + 1;
      return acc;
    }, {});
    return { appointments, counts };
  }
}
