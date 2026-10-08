import { Injectable } from '@nestjs/common';
import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { FirebaseService } from '../../../shared/firebase/firebase.service';
import { TENANT_COLLECTION, tenantCollectionPath } from '../../../shared/firebase/firestore-path';
import {
  createBaseFields,
  isDeleted,
  touchBaseFields,
} from '../../../shared/firestore/base-document';
import { paginateInMemory } from '../../../shared/http/paginate-memory';
import { TenantContext } from '../../../shared/tenancy/tenant.context';
import { ListGroomingAppointmentsQueryDto } from './dto/list-grooming-appointments.query.dto';
import { GroomingAppointment } from './entities/grooming-appointment.entity';

@Injectable()
export class GroomingAppointmentsRepository {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly tenantContext: TenantContext,
  ) {}

  private collection() {
    return this.firebase.db.collection(
      tenantCollectionPath(this.tenantContext.getTenantId(), TENANT_COLLECTION.groomingAppointments),
    );
  }

  async list(query?: ListGroomingAppointmentsQueryDto) {
    const snapshot = await this.collection().get();
    let items = snapshot.docs
      .map((doc) => doc.data() as GroomingAppointment)
      .filter((item) => !isDeleted(item));

    if (query?.status) {
      items = items.filter((s) => s.status === query.status);
    }
    if (query?.staffId) {
      items = items.filter((s) => s.staffId === query.staffId);
    }
    if (query?.patientId) {
      items = items.filter((s) => s.patientId === query.patientId);
    }
    if (query?.customerId) {
      items = items.filter((s) => s.customerId === query.customerId);
    }
    if (query?.date) {
      items = items.filter((s) => s.date === query.date);
    }
    if (query?.startDate) {
      items = items.filter((s) => s.date >= query.startDate!);
    }
    if (query?.endDate) {
      items = items.filter((s) => s.date <= query.endDate!);
    }
    if (query?.q) {
      const q = query.q.trim().toLowerCase();
      items = items.filter(
        (s) =>
          s.patientName?.toLowerCase().includes(q) ||
          s.customerName?.toLowerCase().includes(q) ||
          s.serviceName?.toLowerCase().includes(q) ||
          s.staffName?.toLowerCase().includes(q),
      );
    }

    items.sort((a, b) => {
      const dateCmp = (b.date || '').localeCompare(a.date || '');
      if (dateCmp !== 0) return dateCmp;
      return (b.time || '').localeCompare(a.time || '');
    });

    return paginateInMemory(items, query?.limit, query?.cursor);
  }

  async getAll(): Promise<GroomingAppointment[]> {
    const snapshot = await this.collection().get();
    return snapshot.docs
      .map((doc) => doc.data() as GroomingAppointment)
      .filter((item) => !isDeleted(item));
  }

  async findById(id: string): Promise<GroomingAppointment | null> {
    const snapshot = await this.collection().doc(id).get();
    if (!snapshot.exists) return null;
    const item = snapshot.data() as GroomingAppointment;
    return isDeleted(item) ? null : item;
  }

  async getByIdOrThrow(id: string): Promise<GroomingAppointment> {
    const item = await this.findById(id);
    if (!item) {
      throw new AppException(ErrorCode.GROOMING_APPOINTMENT_NOT_FOUND, 'Kuaför randevusu bulunamadı');
    }
    return item;
  }

  async create(data: Omit<GroomingAppointment, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy' | 'deletedAt'>): Promise<GroomingAppointment> {
    const ref = this.collection().doc();
    const item: GroomingAppointment = {
      ...createBaseFields(ref.id, this.tenantContext.getUserId()),
      ...data,
    };
    await ref.set(item);
    return item;
  }

  async update(id: string, updateData: Partial<GroomingAppointment>): Promise<GroomingAppointment> {
    const current = await this.getByIdOrThrow(id);
    const updated: GroomingAppointment = {
      ...current,
      ...touchBaseFields(this.tenantContext.getUserId()),
      ...updateData,
    };
    await this.collection().doc(id).set(updated);
    return updated;
  }

  async softDelete(id: string): Promise<void> {
    await this.getByIdOrThrow(id);
    await this.collection().doc(id).update({
      deletedAt: new Date().toISOString(),
      ...touchBaseFields(this.tenantContext.getUserId()),
    });
  }
}