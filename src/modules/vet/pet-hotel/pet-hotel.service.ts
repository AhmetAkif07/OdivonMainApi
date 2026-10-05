import { Injectable } from '@nestjs/common';
import { CustomersRepository } from '../customers/customers.repository';
import { PatientsRepository } from '../patients/patients.repository';
import { CreateHotelDailyLogDto } from './dto/create-hotel-daily-log.dto';
import { CreateHotelRoomDto } from './dto/create-hotel-room.dto';
import { CreateHotelStayDto } from './dto/create-hotel-stay.dto';
import { CheckOutHotelStayDto } from './dto/check-out-hotel-stay.dto';
import { ListHotelDailyLogsQueryDto } from './dto/list-hotel-daily-logs.query.dto';
import { ListHotelRoomsQueryDto } from './dto/list-hotel-rooms.query.dto';
import { ListHotelStaysQueryDto } from './dto/list-hotel-stays.query.dto';
import { UpdateHotelRoomDto } from './dto/update-hotel-room.dto';
import { UpdateHotelStayDto } from './dto/update-hotel-stay.dto';
import { HotelDailyLog } from './entities/hotel-daily-log.entity';
import { HotelRoom } from './entities/hotel-room.entity';
import { HotelStay } from './entities/hotel-stay.entity';
import { HotelDailyLogsRepository } from './hotel-daily-logs.repository';
import { HotelRoomsRepository } from './hotel-rooms.repository';
import { HotelStaysRepository } from './hotel-stays.repository';

export interface PetHotelBoardSummary {
  rooms: (HotelRoom & { currentStay?: HotelStay | null })[];
  totalRooms: number;
  availableCount: number;
  occupiedCount: number;
  cleaningCount: number;
  maintenanceCount: number;
  todayCheckIns: number;
  todayCheckOuts: number;
}

@Injectable()
export class PetHotelService {
  constructor(
    private readonly roomsRepo: HotelRoomsRepository,
    private readonly staysRepo: HotelStaysRepository,
    private readonly logsRepo: HotelDailyLogsRepository,
    private readonly customersRepo: CustomersRepository,
    private readonly patientsRepo: PatientsRepository,
  ) {}

  // --- ROOMS ---
  listRooms(query?: ListHotelRoomsQueryDto) {
    return this.roomsRepo.list(query);
  }

  getRoomById(id: string) {
    return this.roomsRepo.getByIdOrThrow(id);
  }

  createRoom(dto: CreateHotelRoomDto) {
    return this.roomsRepo.create(dto);
  }

  updateRoom(id: string, dto: UpdateHotelRoomDto) {
    return this.roomsRepo.update(id, dto);
  }

  deleteRoom(id: string) {
    return this.roomsRepo.softDelete(id);
  }

  // --- STAYS ---
  listStays(query?: ListHotelStaysQueryDto) {
    return this.staysRepo.list(query);
  }

  getStaysById(id: string) {
    return this.staysRepo.getByIdOrThrow(id);
  }

  async createStay(dto: CreateHotelStayDto): Promise<HotelStay> {
    const [room, customer, patient] = await Promise.all([
      this.roomsRepo.getByIdOrThrow(dto.roomId),
      this.customersRepo.getByIdOrThrow(dto.customerId),
      this.patientsRepo.getByIdOrThrow(dto.patientId),
    ]);

    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);
    const diffTime = Math.max(0, endDate.getTime() - startDate.getTime());
    const totalDays = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
    const dailyRate = dto.dailyRate ?? room.dailyRate ?? 450;
    const totalAmount = totalDays * dailyRate + (dto.extraServicesAmount || 0);

    const now = new Date().toISOString();
    const stay = await this.staysRepo.create({
      customerId: dto.customerId,
      customerName: `${customer.firstName} ${customer.lastName}`.trim(),
      customerPhone: customer.phone || '',
      patientId: dto.patientId,
      patientName: patient.name,
      patientSpecies: patient.animalType || undefined,
      patientBreed: patient.breed || undefined,
      roomId: dto.roomId,
      roomName: room.name,
      roomType: room.type,
      startDate: dto.startDate,
      endDate: dto.endDate,
      checkInTime: dto.checkInTime || '10:00',
      checkOutTime: dto.checkOutTime || '12:00',
      actualCheckInAt: dto.status === 'checked_in' ? now : null,
      actualCheckOutAt: null,
      status: dto.status || 'reserved',
      dailyRate,
      totalDays,
      totalAmount,
      dietNotes: dto.dietNotes || null,
      medicationNotes: dto.medicationNotes || null,
      behaviorNotes: dto.behaviorNotes || null,
      belongings: dto.belongings || [],
      emergencyContact: dto.emergencyContact || null,
      vaccineChecked: dto.vaccineChecked !== undefined ? dto.vaccineChecked : true,
      extraServicesAmount: dto.extraServicesAmount || 0,
      notes: dto.notes || null,
      saleId: null,
    });

    if (dto.status === 'checked_in') {
      await this.roomsRepo.updateStatus(dto.roomId, 'occupied', stay.id, patient.name);
    }

    return stay;
  }

  async checkInStay(id: string): Promise<HotelStay> {
    const stay = await this.staysRepo.getByIdOrThrow(id);
    const now = new Date().toISOString();
    const updated = await this.staysRepo.update(id, {
      status: 'checked_in',
      actualCheckInAt: now,
    });
    await this.roomsRepo.updateStatus(stay.roomId, 'occupied', stay.id, stay.patientName);
    return updated;
  }

  async checkOutStay(id: string, dto?: CheckOutHotelStayDto): Promise<HotelStay> {
    const stay = await this.staysRepo.getByIdOrThrow(id);
    const now = new Date().toISOString();

    const extraAmount = dto?.extraServicesAmount !== undefined ? dto.extraServicesAmount : (stay.extraServicesAmount || 0);
    const totalAmount = stay.totalDays * stay.dailyRate + extraAmount;

    const updated = await this.staysRepo.update(id, {
      status: 'checked_out',
      actualCheckOutAt: dto?.actualCheckOutAt || now,
      extraServicesAmount: extraAmount,
      totalAmount,
      notes: dto?.notes ? (stay.notes ? `${stay.notes}\n${dto.notes}` : dto.notes) : stay.notes,
      saleId: dto?.saleId || stay.saleId || null,
    });

    await this.roomsRepo.updateStatus(stay.roomId, 'cleaning', null, null);
    return updated;
  }

  async updateStay(id: string, dto: UpdateHotelStayDto): Promise<HotelStay> {
    return this.staysRepo.update(id, dto);
  }

  async deleteStay(id: string): Promise<void> {
    const stay = await this.staysRepo.getByIdOrThrow(id);
    await this.staysRepo.softDelete(id);
    if (stay.status === 'checked_in') {
      await this.roomsRepo.updateStatus(stay.roomId, 'available', null, null);
    }
  }

  // --- DAILY LOGS ---
  listDailyLogs(query?: ListHotelDailyLogsQueryDto) {
    return this.logsRepo.list(query);
  }

  async createDailyLog(dto: CreateHotelDailyLogDto): Promise<HotelDailyLog> {
    const stay = await this.staysRepo.getByIdOrThrow(dto.stayId);
    const now = new Date().toISOString();
    return this.logsRepo.create({
      stayId: dto.stayId,
      patientId: stay.patientId,
      patientName: stay.patientName,
      date: dto.date || now.split('T')[0],
      morningMeal: dto.morningMeal !== undefined ? dto.morningMeal : true,
      morningMealNotes: dto.morningMealNotes || null,
      eveningMeal: dto.eveningMeal !== undefined ? dto.eveningMeal : true,
      eveningMealNotes: dto.eveningMealNotes || null,
      morningWalk: dto.morningWalk !== undefined ? dto.morningWalk : true,
      eveningWalk: dto.eveningWalk !== undefined ? dto.eveningWalk : true,
      medicationGiven: dto.medicationGiven !== undefined ? dto.medicationGiven : false,
      medicationNotes: dto.medicationNotes || null,
      urination: dto.urination || 'normal',
      defecation: dto.defecation || 'normal',
      mood: dto.mood || 'happy',
      staffName: dto.staffName || null,
      notes: dto.notes || null,
      photoUrl: dto.photoUrl || null,
      whatsAppNotified: dto.whatsAppNotified !== undefined ? dto.whatsAppNotified : false,
      whatsAppNotifiedAt: dto.whatsAppNotified ? now : null,
    });
  }

  updateDailyLog(id: string, updateData: Partial<HotelDailyLog>) {
    return this.logsRepo.update(id, updateData);
  }

  deleteDailyLog(id: string) {
    return this.logsRepo.softDelete(id);
  }

  // --- BOARD / SUMMARY ---
  async getBoardSummary(): Promise<PetHotelBoardSummary> {
    const [allRooms, allStays] = await Promise.all([
      this.roomsRepo.getAll(),
      this.staysRepo.getAll(),
    ]);

    const todayStr = new Date().toISOString().split('T')[0];

    const activeStays = allStays.filter((s) => s.status === 'checked_in');
    const stayMap = new Map<string, HotelStay>();
    for (const stay of activeStays) {
      stayMap.set(stay.roomId, stay);
    }

    const roomsWithStays = allRooms.map((room) => ({
      ...room,
      currentStay: stayMap.get(room.id) || null,
    }));

    const totalRooms = allRooms.length;
    const availableCount = allRooms.filter((r) => r.status === 'available').length;
    const occupiedCount = allRooms.filter((r) => r.status === 'occupied').length;
    const cleaningCount = allRooms.filter((r) => r.status === 'cleaning').length;
    const maintenanceCount = allRooms.filter((r) => r.status === 'maintenance').length;

    const todayCheckIns = allStays.filter((s) => s.startDate === todayStr && s.status !== 'cancelled').length;
    const todayCheckOuts = allStays.filter((s) => s.endDate === todayStr && s.status !== 'cancelled').length;

    return {
      rooms: roomsWithStays,
      totalRooms,
      availableCount,
      occupiedCount,
      cleaningCount,
      maintenanceCount,
      todayCheckIns,
      todayCheckOuts,
    };
  }
}
