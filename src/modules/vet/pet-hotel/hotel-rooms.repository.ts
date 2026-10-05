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
import { CreateHotelRoomDto } from './dto/create-hotel-room.dto';
import { ListHotelRoomsQueryDto } from './dto/list-hotel-rooms.query.dto';
import { UpdateHotelRoomDto } from './dto/update-hotel-room.dto';
import { HotelRoom, HotelRoomStatus } from './entities/hotel-room.entity';

@Injectable()
export class HotelRoomsRepository {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly tenantContext: TenantContext,
  ) {}

  private collection() {
    return this.firebase.db.collection(
      tenantCollectionPath(this.tenantContext.getTenantId(), TENANT_COLLECTION.hotelRooms),
    );
  }

  async list(query?: ListHotelRoomsQueryDto) {
    const snapshot = await this.collection().get();
    let items = snapshot.docs
      .map((doc) => doc.data() as HotelRoom)
      .filter((item) => !isDeleted(item));

    if (query?.type) {
      items = items.filter((r) => r.type === query.type);
    }
    if (query?.species) {
      items = items.filter((r) => r.species === query.species || r.species === 'all');
    }
    if (query?.status) {
      items = items.filter((r) => r.status === query.status);
    }
    if (query?.q) {
      const q = query.q.trim().toLowerCase();
      items = items.filter((r) => r.name.toLowerCase().includes(q) || (r.code && r.code.toLowerCase().includes(q)));
    }

    items.sort((a, b) => a.name.localeCompare(b.name, 'tr'));
    return paginateInMemory(items, query?.limit, query?.cursor);
  }

  async getAll(): Promise<HotelRoom[]> {
    const snapshot = await this.collection().get();
    return snapshot.docs
      .map((doc) => doc.data() as HotelRoom)
      .filter((item) => !isDeleted(item))
      .sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  }

  async findById(id: string): Promise<HotelRoom | null> {
    const snapshot = await this.collection().doc(id).get();
    if (!snapshot.exists) return null;
    const room = snapshot.data() as HotelRoom;
    return isDeleted(room) ? null : room;
  }

  async getByIdOrThrow(id: string): Promise<HotelRoom> {
    const room = await this.findById(id);
    if (!room) {
      throw new AppException(ErrorCode.HOTEL_ROOM_NOT_FOUND, 'Otel odası bulunamadı');
    }
    return room;
  }

  async create(dto: CreateHotelRoomDto): Promise<HotelRoom> {
    const ref = this.collection().doc();
    const room: HotelRoom = {
      ...createBaseFields(ref.id, this.tenantContext.getUserId()),
      name: dto.name,
      code: dto.code ?? null,
      type: dto.type,
      species: dto.species,
      capacity: dto.capacity ?? 1,
      dailyRate: dto.dailyRate ?? 450,
      status: dto.status ?? 'available',
      features: dto.features ?? [],
      notes: dto.notes ?? null,
      currentStayId: null,
      currentPatientName: null,
      active: dto.active !== undefined ? dto.active : true,
    };

    await ref.set(room);
    return room;
  }

  async update(id: string, dto: UpdateHotelRoomDto): Promise<HotelRoom> {
    const current = await this.getByIdOrThrow(id);
    const updated: HotelRoom = {
      ...current,
      ...touchBaseFields(this.tenantContext.getUserId()),
      name: dto.name ?? current.name,
      code: dto.code !== undefined ? dto.code : current.code,
      type: dto.type ?? current.type,
      species: dto.species ?? current.species,
      capacity: dto.capacity ?? current.capacity,
      dailyRate: dto.dailyRate ?? current.dailyRate,
      status: dto.status ?? current.status,
      features: dto.features ?? current.features,
      notes: dto.notes !== undefined ? dto.notes : current.notes,
      active: dto.active !== undefined ? dto.active : current.active,
    };

    await this.collection().doc(id).set(updated);
    return updated;
  }

  async updateStatus(id: string, status: HotelRoomStatus, stayId: string | null = null, patientName: string | null = null): Promise<void> {
    await this.getByIdOrThrow(id);
    await this.collection().doc(id).update({
      status,
      currentStayId: stayId,
      currentPatientName: patientName,
      ...touchBaseFields(this.tenantContext.getUserId()),
    });
  }

  async softDelete(id: string): Promise<void> {
    await this.getByIdOrThrow(id);
    await this.collection().doc(id).update({
      deletedAt: new Date().toISOString(),
      ...touchBaseFields(this.tenantContext.getUserId()),
    });
  }
}
