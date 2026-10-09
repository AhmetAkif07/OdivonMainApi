import { Injectable } from '@nestjs/common';
import { CustomersRepository } from '../customers/customers.repository';
import { PatientsRepository } from '../patients/patients.repository';
import { CreateGroomingAppointmentDto } from './dto/create-grooming-appointment.dto';
import { CreateGroomingStaffDto, UpdateGroomingStaffDto } from './dto/create-grooming-staff.dto';
import { ListGroomingAppointmentsQueryDto } from './dto/list-grooming-appointments.query.dto';
import { UpdateGroomingAppointmentDto } from './dto/update-grooming-appointment.dto';
import {
  GroomingAppointment,
  GroomingStaff,
  GroomingStatus,
} from './entities/grooming-appointment.entity';
import { GroomingAppointmentsRepository } from './grooming-appointments.repository';
import { GroomingStaffRepository } from './grooming-staff.repository';

@Injectable()
export class GroomingService {
  constructor(
    private readonly appointmentsRepo: GroomingAppointmentsRepository,
    private readonly staffRepo: GroomingStaffRepository,
    private readonly customersRepo: CustomersRepository,
    private readonly patientsRepo: PatientsRepository,
  ) {}

  // --- APPOINTMENTS ---
  async listAppointments(query?: ListGroomingAppointmentsQueryDto) {
    return this.appointmentsRepo.list(query);
  }

  async getAppointmentById(id: string): Promise<GroomingAppointment> {
    return this.appointmentsRepo.getByIdOrThrow(id);
  }

  async createAppointment(dto: CreateGroomingAppointmentDto): Promise<GroomingAppointment> {
    let customerName = dto.customerName;
    let customerPhone = dto.customerPhone;
    if (!customerName && dto.customerId) {
      const customer = await this.customersRepo.findById(dto.customerId);
      if (customer) {
        customerName = (customer.firstName + ' ' + customer.lastName).trim();
        customerPhone = customer.phone ?? null;
      }
    }

    let patientName = dto.patientName;
    let animalType = dto.animalType;
    let patientBreed = dto.patientBreed;
    if (!patientName && dto.patientId) {
      const patient = await this.patientsRepo.findById(dto.patientId);
      if (patient) {
        patientName = patient.name;
        animalType = patient.animalType;
        patientBreed = patient.breed ?? null;
      }
    }

    let staffName = dto.staffName;
    let commissionRate = dto.commissionRate ?? 30;
    if (dto.staffId) {
      const staff = await this.staffRepo.findById(dto.staffId);
      if (staff) {
        staffName = staff.name;
        if (dto.commissionRate === undefined) {
          commissionRate = staff.commissionRate;
        }
      }
    }

    const price = dto.price ?? 0;
    const commissionAmount = Math.round((price * commissionRate) / 100);

    return this.appointmentsRepo.create({
      date: dto.date,
      time: dto.time,
      customerId: dto.customerId,
      customerName: customerName || 'Bilinmeyen Müşteri',
      customerPhone: customerPhone || null,
      patientId: dto.patientId,
      patientName: patientName || 'İsimsiz Hasta',
      animalType: animalType || 'Köpek',
      patientBreed: patientBreed || null,
      staffId: dto.staffId,
      staffName: staffName || 'Kuaför',
      serviceId: dto.serviceId,
      serviceName: dto.serviceName || 'Kuaför Hizmeti',
      price,
      commissionRate,
      commissionAmount,
      status: dto.status || 'waiting',
      temperament: dto.temperament || 'calm',
      specialNotes: dto.specialNotes || null,
      durationMinutes: dto.durationMinutes || 60,
    });
  }

  async updateAppointment(id: string, dto: UpdateGroomingAppointmentDto): Promise<GroomingAppointment> {
    const existing = await this.appointmentsRepo.getByIdOrThrow(id);
    const price = dto.price !== undefined ? dto.price : existing.price;
    const commissionRate =
      dto.commissionRate !== undefined ? dto.commissionRate : existing.commissionRate;
    const commissionAmount = Math.round((price * commissionRate) / 100);

    return this.appointmentsRepo.update(id, {
      ...dto,
      price,
      commissionRate,
      commissionAmount,
    });
  }

  async updateStatus(id: string, status: GroomingStatus): Promise<GroomingAppointment> {
    return this.appointmentsRepo.update(id, { status });
  }

  async deleteAppointment(id: string): Promise<void> {
    await this.appointmentsRepo.softDelete(id);
  }

  // --- STAFF ---
  async listStaff(): Promise<GroomingStaff[]> {
    return this.staffRepo.list();
  }

  async createStaff(dto: CreateGroomingStaffDto): Promise<GroomingStaff> {
    return this.staffRepo.create({
      name: dto.name,
      title: dto.title,
      commissionRate: dto.commissionRate ?? 30,
      phone: dto.phone ?? null,
      active: dto.active ?? true,
    });
  }

  async updateStaff(id: string, dto: UpdateGroomingStaffDto): Promise<GroomingStaff> {
    return this.staffRepo.update(id, dto);
  }

  async deleteStaff(id: string): Promise<void> {
    await this.staffRepo.softDelete(id);
  }

  // --- DASHBOARD / COMMISSIONS ---
  async getBoardSummary(date?: string) {
    const targetDate = date || new Date().toISOString().slice(0, 10);
    const all = await this.appointmentsRepo.getAll();
    const todayAppointments = all.filter((a) => a.date === targetDate);

    const totalToday = todayAppointments.length;
    const waiting = todayAppointments.filter((a) => a.status === 'waiting').length;
    const inProgress = todayAppointments.filter((a) => a.status === 'in_progress').length;
    const completed = todayAppointments.filter((a) => a.status === 'completed').length;
    const revenue = todayAppointments
      .filter((a) => a.status === 'completed')
      .reduce((sum, a) => sum + (a.price || 0), 0);
    const commission = todayAppointments
      .filter((a) => a.status === 'completed')
      .reduce((sum, a) => sum + (a.commissionAmount || 0), 0);

    return {
      date: targetDate,
      totalToday,
      waiting,
      inProgress,
      completed,
      revenue,
      commission,
      netClinicEarnings: revenue - commission,
      appointments: todayAppointments,
    };
  }

  async getCommissionReport(startDate?: string, endDate?: string, staffId?: string) {
    let appointments = await this.appointmentsRepo.getAll();
    if (startDate) {
      appointments = appointments.filter((a) => a.date >= startDate);
    }
    if (endDate) {
      appointments = appointments.filter((a) => a.date <= endDate);
    }
    if (staffId) {
      appointments = appointments.filter((a) => a.staffId === staffId);
    }

    const staffList = await this.staffRepo.list();
    const staffMap = new Map(staffList.map((s) => [s.id, s]));

    const perStaffSummary: Record<
      string,
      {
        staffId: string;
        staffName: string;
        title: string;
        rate: number;
        completedCount: number;
        totalRevenue: number;
        totalCommission: number;
      }
    > = {};

    for (const app of appointments) {
      if (app.status !== 'completed') continue;
      const sid = app.staffId || 'unassigned';
      if (!perStaffSummary[sid]) {
        const staffObj = staffMap.get(sid);
        perStaffSummary[sid] = {
          staffId: sid,
          staffName: staffObj?.name || app.staffName || 'Bilinmeyen Personel',
          title: staffObj?.title || 'Personel',
          rate: staffObj?.commissionRate || app.commissionRate || 30,
          completedCount: 0,
          totalRevenue: 0,
          totalCommission: 0,
        };
      }
      perStaffSummary[sid].completedCount += 1;
      perStaffSummary[sid].totalRevenue += app.price || 0;
      perStaffSummary[sid].totalCommission += app.commissionAmount || 0;
    }

    const rows = Object.values(perStaffSummary);
    const totalRevenue = rows.reduce((acc, r) => acc + r.totalRevenue, 0);
    const totalCommissions = rows.reduce((acc, r) => acc + r.totalCommission, 0);

    return {
      startDate,
      endDate,
      totalRevenue,
      totalCommissions,
      netClinicProfit: totalRevenue - totalCommissions,
      staffBreakdown: rows,
    };
  }
}