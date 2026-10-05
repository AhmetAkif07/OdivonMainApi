import { Injectable } from '@nestjs/common';
import { AuditService } from '../../../shared/audit/audit.service';
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
import { CreateCageDto } from './dto/create-cage.dto';
import { CreateHospitalizationDto } from './dto/create-hospitalization.dto';
import { CreateVitalLogDto } from './dto/create-vital-log.dto';
import { ListHospitalizationsQueryDto } from './dto/list-hospitalizations.query.dto';
import { UpdateCageDto } from './dto/update-cage.dto';
import { UpdateHospitalizationDto } from './dto/update-hospitalization.dto';
import { Cage } from './entities/cage.entity';
import { Hospitalization, HospitalizationVitalLog } from './entities/hospitalization.entity';

@Injectable()
export class HospitalizationRepository {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly tenantContext: TenantContext,
    private readonly audit: AuditService,
  ) {}

  private hospitalizationsCollection() {
    return this.firebase.db.collection(
      tenantCollectionPath(this.tenantContext.getTenantId(), TENANT_COLLECTION.hospitalizations),
    );
  }

  private cagesCollection() {
    return this.firebase.db.collection(
      tenantCollectionPath(this.tenantContext.getTenantId(), TENANT_COLLECTION.cages),
    );
  }

  // --- CAGE OPERATIONS ---
  async listCages(): Promise<Cage[]> {
    const snapshot = await this.cagesCollection().get();
    let cages = snapshot.docs
      .map((doc) => doc.data() as Cage)
      .filter((c) => !isDeleted(c));

    if (cages.length === 0) {
      cages = await this.seedDefaultCages();
    }
    return cages.sort((a, b) => a.name.localeCompare(b.name));
  }

  async findCageById(id: string): Promise<Cage | null> {
    const snapshot = await this.cagesCollection().doc(id).get();
    if (!snapshot.exists) return null;
    const cage = snapshot.data() as Cage;
    return isDeleted(cage) ? null : cage;
  }

  async getCageByIdOrThrow(id: string): Promise<Cage> {
    const cage = await this.findCageById(id);
    if (!cage) {
      throw new AppException(ErrorCode.CAGE_NOT_FOUND, 'Kafes / Box bulunamadı');
    }
    return cage;
  }

  async createCage(dto: CreateCageDto): Promise<Cage> {
    const ref = this.cagesCollection().doc();
    const cage: Cage = {
      ...createBaseFields(ref.id, this.tenantContext.getUserId()),
      name: dto.name,
      type: dto.type,
      status: dto.status ?? 'available',
      dailyRate: dto.dailyRate ?? 350,
      notes: dto.notes ?? null,
      currentHospitalizationId: null,
      currentPatientName: null,
    };
    await ref.set(cage);
    return cage;
  }

  async updateCage(id: string, dto: UpdateCageDto): Promise<Cage> {
    const current = await this.getCageByIdOrThrow(id);
    const updated: Cage = {
      ...current,
      name: dto.name ?? current.name,
      type: dto.type ?? current.type,
      status: dto.status ?? current.status,
      dailyRate: dto.dailyRate ?? current.dailyRate,
      notes: dto.notes !== undefined ? dto.notes : current.notes,
      currentHospitalizationId:
        dto.currentHospitalizationId !== undefined
          ? dto.currentHospitalizationId
          : current.currentHospitalizationId,
      currentPatientName:
        dto.currentPatientName !== undefined
          ? dto.currentPatientName
          : current.currentPatientName,
      ...touchBaseFields(this.tenantContext.getUserId()),
    };
    await this.cagesCollection().doc(id).set(updated);
    return updated;
  }

  private async seedDefaultCages(): Promise<Cage[]> {
    const defaults: Array<{ name: string; type: 'cat' | 'dog' | 'icu' | 'quarantine'; dailyRate: number }> = [
      { name: 'Kedi Katı Box 1', type: 'cat', dailyRate: 350 },
      { name: 'Kedi Katı Box 2', type: 'cat', dailyRate: 350 },
      { name: 'Kedi Katı Box 3', type: 'cat', dailyRate: 350 },
      { name: 'Köpek Katı Box 1', type: 'dog', dailyRate: 450 },
      { name: 'Köpek Katı Box 2', type: 'dog', dailyRate: 450 },
      { name: 'Yoğun Bakım Küvözü (ICU)', type: 'icu', dailyRate: 750 },
      { name: 'İzolasyon & Karantina', type: 'quarantine', dailyRate: 500 },
    ];
    const created: Cage[] = [];
    for (const item of defaults) {
      const c = await this.createCage(item);
      created.push(c);
    }
    return created;
  }

  // --- HOSPITALIZATION OPERATIONS ---
  async create(dto: CreateHospitalizationDto, cageName: string, doctorName?: string): Promise<Hospitalization> {
    const ref = this.hospitalizationsCollection().doc();
    const hospitalization: Hospitalization = {
      ...createBaseFields(ref.id, this.tenantContext.getUserId()),
      customerId: dto.customerId,
      patientId: dto.patientId,
      cageId: dto.cageId,
      cageName,
      admittedAt: new Date(dto.admittedAt).toISOString(),
      expectedDischargeAt: dto.expectedDischargeAt ? new Date(dto.expectedDischargeAt).toISOString() : null,
      actualDischargeAt: null,
      reason: dto.reason,
      diagnosis: dto.diagnosis ?? null,
      doctorId: dto.doctorId ?? null,
      doctorName: doctorName ?? null,
      dailyCost: dto.dailyCost ?? 350,
      treatmentNotes: dto.treatmentNotes ?? null,
      status: dto.status ?? 'active',
      logs: [],
      saleId: null,
    };
    await ref.set(hospitalization);
    return hospitalization;
  }

  async findById(id: string): Promise<Hospitalization | null> {
    const snapshot = await this.hospitalizationsCollection().doc(id).get();
    if (!snapshot.exists) return null;
    const h = snapshot.data() as Hospitalization;
    return isDeleted(h) ? null : h;
  }

  async getByIdOrThrow(id: string): Promise<Hospitalization> {
    const h = await this.findById(id);
    if (!h) {
      throw new AppException(ErrorCode.HOSPITALIZATION_NOT_FOUND, 'Yatış kaydı bulunamadı');
    }
    return h;
  }

  async collect(query: ListHospitalizationsQueryDto): Promise<Hospitalization[]> {
    const snapshot = await this.hospitalizationsCollection().get();
    return snapshot.docs
      .map((doc) => doc.data() as Hospitalization)
      .filter((h) => !isDeleted(h))
      .filter((h) => (query.patientId ? h.patientId === query.patientId : true))
      .filter((h) => (query.customerId ? h.customerId === query.customerId : true))
      .filter((h) => (query.cageId ? h.cageId === query.cageId : true))
      .filter((h) => (query.status ? h.status === query.status : true))
      .sort((a, b) => b.admittedAt.localeCompare(a.admittedAt));
  }

  async list(query: ListHospitalizationsQueryDto) {
    return paginateInMemory(await this.collect(query), query.limit, query.cursor);
  }

  async update(id: string, dto: UpdateHospitalizationDto, cageName?: string, doctorName?: string): Promise<Hospitalization> {
    const current = await this.getByIdOrThrow(id);
    const updated: Hospitalization = {
      ...current,
      cageId: dto.cageId ?? current.cageId,
      cageName: cageName !== undefined ? cageName : current.cageName,
      admittedAt: dto.admittedAt ? new Date(dto.admittedAt).toISOString() : current.admittedAt,
      expectedDischargeAt:
        dto.expectedDischargeAt !== undefined
          ? dto.expectedDischargeAt
            ? new Date(dto.expectedDischargeAt).toISOString()
            : null
          : current.expectedDischargeAt,
      actualDischargeAt:
        dto.actualDischargeAt !== undefined
          ? dto.actualDischargeAt
            ? new Date(dto.actualDischargeAt).toISOString()
            : null
          : current.actualDischargeAt,
      reason: dto.reason ?? current.reason,
      diagnosis: dto.diagnosis !== undefined ? dto.diagnosis : current.diagnosis,
      doctorId: dto.doctorId !== undefined ? dto.doctorId : current.doctorId,
      doctorName: doctorName !== undefined ? doctorName : current.doctorName,
      dailyCost: dto.dailyCost ?? current.dailyCost,
      treatmentNotes: dto.treatmentNotes !== undefined ? dto.treatmentNotes : current.treatmentNotes,
      status: dto.status ?? current.status,
      saleId: dto.saleId !== undefined ? dto.saleId : current.saleId,
      ...touchBaseFields(this.tenantContext.getUserId()),
    };
    await this.hospitalizationsCollection().doc(id).set(updated);
    return updated;
  }

  async addVitalLog(id: string, logDto: CreateVitalLogDto): Promise<Hospitalization> {
    const current = await this.getByIdOrThrow(id);
    const newLog: HospitalizationVitalLog = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      loggedAt: logDto.loggedAt ? new Date(logDto.loggedAt).toISOString() : new Date().toISOString(),
      temp: logDto.temp ?? null,
      pulse: logDto.pulse ?? null,
      respiratoryRate: logDto.respiratoryRate ?? null,
      weight: logDto.weight ?? null,
      appetite: logDto.appetite ?? null,
      defecation: logDto.defecation ?? null,
      urination: logDto.urination ?? null,
      notes: logDto.notes ?? null,
      staffName: logDto.staffName ?? null,
    };
    const updatedLogs = [newLog, ...(current.logs || [])];
    const updated: Hospitalization = {
      ...current,
      logs: updatedLogs,
      ...touchBaseFields(this.tenantContext.getUserId()),
    };
    await this.hospitalizationsCollection().doc(id).set(updated);
    return updated;
  }

  async discharge(id: string, actualDischargeAt?: string): Promise<Hospitalization> {
    const current = await this.getByIdOrThrow(id);
    const updated: Hospitalization = {
      ...current,
      status: 'discharged',
      actualDischargeAt: actualDischargeAt
        ? new Date(actualDischargeAt).toISOString()
        : new Date().toISOString(),
      ...touchBaseFields(this.tenantContext.getUserId()),
    };
    await this.hospitalizationsCollection().doc(id).set(updated);
    return updated;
  }

  async softDelete(id: string): Promise<void> {
    await this.getByIdOrThrow(id);
    await this.hospitalizationsCollection()
      .doc(id)
      .update({
        deletedAt: new Date().toISOString(),
        ...touchBaseFields(this.tenantContext.getUserId()),
      });
  }
}
