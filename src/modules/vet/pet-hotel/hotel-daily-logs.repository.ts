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
import { ListHotelDailyLogsQueryDto } from './dto/list-hotel-daily-logs.query.dto';
import { HotelDailyLog } from './entities/hotel-daily-log.entity';

@Injectable()
export class HotelDailyLogsRepository {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly tenantContext: TenantContext,
  ) {}

  private collection() {
    return this.firebase.db.collection(
      tenantCollectionPath(this.tenantContext.getTenantId(), TENANT_COLLECTION.hotelDailyLogs),
    );
  }

  async list(query?: ListHotelDailyLogsQueryDto) {
    const snapshot = await this.collection().get();
    let items = snapshot.docs
      .map((doc) => doc.data() as HotelDailyLog)
      .filter((item) => !isDeleted(item));

    if (query?.stayId) {
      items = items.filter((l) => l.stayId === query.stayId);
    }
    if (query?.date) {
      items = items.filter((l) => l.date === query.date);
    }

    items.sort((a, b) => b.date.localeCompare(a.date));
    return paginateInMemory(items, query?.limit, query?.cursor);
  }

  async findById(id: string): Promise<HotelDailyLog | null> {
    const snapshot = await this.collection().doc(id).get();
    if (!snapshot.exists) return null;
    const log = snapshot.data() as HotelDailyLog;
    return isDeleted(log) ? null : log;
  }

  async getByIdOrThrow(id: string): Promise<HotelDailyLog> {
    const log = await this.findById(id);
    if (!log) {
      throw new AppException(ErrorCode.HOTEL_DAILY_LOG_NOT_FOUND, 'Günlük bakım kaydı bulunamadı');
    }
    return log;
  }

  async create(data: Omit<HotelDailyLog, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy' | 'deletedAt'>): Promise<HotelDailyLog> {
    const ref = this.collection().doc();
    const log: HotelDailyLog = {
      ...createBaseFields(ref.id, this.tenantContext.getUserId()),
      ...data,
    };
    await ref.set(log);
    return log;
  }

  async update(id: string, updateData: Partial<HotelDailyLog>): Promise<HotelDailyLog> {
    const current = await this.getByIdOrThrow(id);
    const updated: HotelDailyLog = {
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
