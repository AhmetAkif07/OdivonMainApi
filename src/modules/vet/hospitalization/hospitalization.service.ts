import { Injectable } from '@nestjs/common';
import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { PaginatedResult } from '../../../shared/http/paginated.result';
import { CustomersRepository } from '../customers/customers.repository';
import { PatientsRepository } from '../patients/patients.repository';
import { CreateCageDto } from './dto/create-cage.dto';
import { CreateHospitalizationDto } from './dto/create-hospitalization.dto';
import { CreateVitalLogDto } from './dto/create-vital-log.dto';
import { ListHospitalizationsQueryDto } from './dto/list-hospitalizations.query.dto';
import { UpdateCageDto } from './dto/update-cage.dto';
import { UpdateHospitalizationDto } from './dto/update-hospitalization.dto';
import { Cage } from './entities/cage.entity';
import { Hospitalization, HospitalizationListItem } from './entities/hospitalization.entity';
import { HospitalizationRepository } from './hospitalization.repository';

@Injectable()
export class HospitalizationService {
  constructor(
    private readonly repo: HospitalizationRepository,
    private readonly customers: CustomersRepository,
    private readonly patients: PatientsRepository,
  ) {}

  // --- CAGE METHODS ---
  listCages(): Promise<Cage[]> {
    return this.repo.listCages();
  }

  createCage(dto: CreateCageDto): Promise<Cage> {
    return this.repo.createCage(dto);
  }

  updateCage(id: string, dto: UpdateCageDto): Promise<Cage> {
    return this.repo.updateCage(id, dto);
  }

  // --- HOSPITALIZATION METHODS ---
  async create(dto: CreateHospitalizationDto): Promise<Hospitalization> {
    const customer = await this.customers.findById(dto.customerId);
    if (!customer) {
      throw new AppException(ErrorCode.CUSTOMER_NOT_FOUND, 'Müşteri bulunamadı');
    }
    const patient = await this.patients.findById(dto.patientId);
    if (!patient) {
      throw new AppException(ErrorCode.PATIENT_NOT_FOUND, 'Hasta bulunamadı');
    }
    const cage = await this.repo.getCageByIdOrThrow(dto.cageId);

    const record = await this.repo.create(dto, cage.name);

    // Mark cage as occupied with current hospitalization
    await this.repo.updateCage(cage.id, {
      status: 'occupied',
      currentHospitalizationId: record.id,
      currentPatientName: patient.name,
    });

    return record;
  }

  getById(id: string): Promise<Hospitalization> {
    return this.repo.getByIdOrThrow(id);
  }

  async list(query: ListHospitalizationsQueryDto): Promise<PaginatedResult<HospitalizationListItem>> {
    const page = await this.repo.list(query);
    const decorated = await this.decorateList(page.items);
    return new PaginatedResult(decorated, page.limit, page.nextCursor);
  }

  async update(id: string, dto: UpdateHospitalizationDto): Promise<Hospitalization> {
    let cageName: string | undefined;
    if (dto.cageId) {
      const cage = await this.repo.getCageByIdOrThrow(dto.cageId);
      cageName = cage.name;
    }
    return this.repo.update(id, dto, cageName);
  }

  addVitalLog(id: string, dto: CreateVitalLogDto): Promise<Hospitalization> {
    return this.repo.addVitalLog(id, dto);
  }

  async discharge(id: string, actualDischargeAt?: string): Promise<Hospitalization> {
    const discharged = await this.repo.discharge(id, actualDischargeAt);

    // Free the cage and set status to cleaning
    if (discharged.cageId) {
      await this.repo.updateCage(discharged.cageId, {
        status: 'cleaning',
        currentHospitalizationId: null,
        currentPatientName: null,
      });
    }
    return discharged;
  }

  async softDelete(id: string): Promise<void> {
    const item = await this.repo.getByIdOrThrow(id);
    await this.repo.softDelete(id);
    if (item.cageId && item.status !== 'discharged') {
      await this.repo.updateCage(item.cageId, {
        status: 'available',
        currentHospitalizationId: null,
        currentPatientName: null,
      });
    }
  }

  private async decorateList(items: Hospitalization[]): Promise<HospitalizationListItem[]> {
    const [customers, patients] = await Promise.all([
      this.customers.findByIds(items.map((i) => i.customerId)),
      this.patients.findByIds(items.map((i) => i.patientId)),
    ]);

    const now = new Date();
    return items.map((item) => {
      const customer = customers.get(item.customerId);
      const patient = patients.get(item.patientId);
      const admitted = new Date(item.admittedAt);
      const dischargeDate = item.actualDischargeAt ? new Date(item.actualDischargeAt) : now;
      const msDiff = Math.max(0, dischargeDate.getTime() - admitted.getTime());
      const days = Math.max(1, Math.ceil(msDiff / (1000 * 60 * 60 * 24)));
      const totalCost = days * (item.dailyCost || 0);

      return {
        ...item,
        customerName: customer ? `${customer.firstName} ${customer.lastName}`.trim() : 'Bilinmeyen Müşteri',
        patientName: patient ? patient.name : 'Bilinmeyen Hasta',
        patientAnimalType: patient?.animalType || undefined,
        daysAdmitted: days,
        totalCost,
      };
    });
  }
}
