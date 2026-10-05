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
import { ListHotelStaysQueryDto } from './dto/list-hotel-stays.query.dto';
import { HotelStay } from './entities/hotel-stay.entity';

@Injectable()
export class HotelStaysRepository {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly tenantContext: TenantContext,
  ) {}

  private collection() {
    return this.firebase.db.collection(
      tenantCollectionPath(this.tenantContext.getTenantId(), TENANT_COLLECTION.hotelStays),
    );
  }

  async list(query?: ListHotelStaysQueryDto) {
    const snapshot = await this.collection().get();
    let items = snapshot.docs
      .map((doc) => doc.data() as HotelStay)
      .filter((item) => !isDeleted(item));

    if (query?.status) {
      items = items.filter((s) => s.status === query.status);
    }
    if (query?.roomId) {
      items = items.filter((s) => s.roomId === query.roomId);
    }
    if (query?.patientId) {
      items = items.filter((s) => s.patientId === query.patientId);
    }
    if (query?.customerId) {
      items = items.filter((s) => s.customerId === query.customerId);
    }
    if (query?.startDate) {
      items = items.filter((s) => s.startDate >= query.startDate!);
    }
    if (query?.endDate) {
      items = items.filter((s) => s.endDate <= query.endDate!);
    }
    if (query?.q) {
      const q = query.q.trim().toLowerCase();
      items = items.filter(
        (s) =>
          s.patientName.toLowerCase().includes(q) ||
          s.customerName.toLowerCase().includes(q) ||
          s.roomName.toLowerCase().includes(q),
      );
    }

    items.sort((a, b) => b.startDate.localeCompare(a.startDate));
    return paginateInMemory(items, query?.limit, query?.cursor);
  }

  async getAll(): Promise<HotelStay[]> {
    const snapshot = await this.collection().get();
    return snapshot.docs
      .map((doc) => doc.data() as HotelStay)
      .filter((item) => !isDeleted(item));
  }

  async findById(id: string): Promise<HotelStay | null> {
    const snapshot = await this.collection().doc(id).get();
    if (!snapshot.exists) return null;
    const stay = snapshot.data() as HotelStay;
    return isDeleted(stay) ? null : stay;
  }

  async getByIdOrThrow(id: string): Promise<HotelStay> {
    const stay = await this.findById(id);
    if (!stay) {
      throw new AppException(ErrorCode.HOTEL_STAY_NOT_FOUND, 'Konaklama kaydı bulunamadı');
    }
    return stay;
  }

  async create(data: Omit<HotelStay, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy' | 'deletedAt'>): Promise<HotelStay> {
    const ref = this.collection().doc();
    const stay: HotelStay = {
      ...createBaseFields(ref.id, this.tenantContext.getUserId()),
      ...data,
    };
    await ref.set(stay);
    return stay;
  }

  async update(id: string, updateData: Partial<HotelStay>): Promise<HotelStay> {
    const current = await this.getByIdOrThrow(id);
    const updated: HotelStay = {
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
