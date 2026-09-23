import { Injectable } from '@nestjs/common';
import { AuditService } from '../../../../shared/audit/audit.service';
import { AuditAction } from '../../../../shared/audit/audit.types';
import { AppException } from '../../../../shared/errors/app.exception';
import { ErrorCode } from '../../../../shared/errors/error-codes';
import { FirebaseService } from '../../../../shared/firebase/firebase.service';
import { TENANT_COLLECTION, tenantCollectionPath } from '../../../../shared/firebase/firestore-path';
import {
  createBaseFields,
  isDeleted,
  omitUndefined,
  touchBaseFields,
} from '../../../../shared/firestore/base-document';
import { TenantContext } from '../../../../shared/tenancy/tenant.context';
import { CreateVaccineDto, UpdateVaccineDto, VaccineMedicineDto } from './vaccine.dto';
import { Vaccine, VaccineMedicine } from './vaccine.entity';

@Injectable()
export class VaccinesRepository {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly tenantContext: TenantContext,
    private readonly audit: AuditService,
  ) {}

  private collection(name: string = TENANT_COLLECTION.vaccines) {
    return this.firebase.db.collection(tenantCollectionPath(this.tenantContext.getTenantId(), name));
  }

  async create(dto: CreateVaccineDto): Promise<Vaccine> {
    const ref = this.collection().doc();
    const vaccine: Vaccine = {
      ...createBaseFields(ref.id, this.tenantContext.getUserId()),
      ...this.toFields(dto),
    };
    await ref.set(vaccine);
    await this.audit.record({ action: AuditAction.VACCINE_CREATED, entity: 'vaccine', entityId: vaccine.id });
    return vaccine;
  }

  async findById(id: string): Promise<Vaccine | null> {
    const snapshot = await this.collection().doc(id).get();
    if (!snapshot.exists) {
      return null;
    }
    const vaccine = snapshot.data() as Vaccine;
    return isDeleted(vaccine) ? null : vaccine;
  }

  async getByIdOrThrow(id: string): Promise<Vaccine> {
    const vaccine = await this.findById(id);
    if (!vaccine) {
      throw new AppException(ErrorCode.VACCINE_NOT_FOUND, 'Vaccine not found');
    }
    return vaccine;
  }

  async findByIds(ids: Array<string | null | undefined>): Promise<Map<string, Vaccine>> {
    const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
    const found = new Map<string, Vaccine>();
    for (let index = 0; index < unique.length; index += 100) {
      const chunk = unique.slice(index, index + 100);
      const snapshots = await this.firebase.db.getAll(...chunk.map((id) => this.collection().doc(id)));
      for (const snapshot of snapshots) {
        if (!snapshot.exists) {
          continue;
        }
        const vaccine = snapshot.data() as Vaccine;
        if (!isDeleted(vaccine)) {
          found.set(vaccine.id, vaccine);
        }
      }
    }
    return found;
  }

  async collect(): Promise<Vaccine[]> {
    const snapshot = await this.collection().get();
    return snapshot.docs
      .map((doc) => doc.data() as Vaccine)
      .filter((item) => !isDeleted(item))
      .sort((left, right) => left.name.localeCompare(right.name, 'tr') || left.id.localeCompare(right.id));
  }

  async update(id: string, dto: UpdateVaccineDto): Promise<Vaccine> {
    const current = await this.getByIdOrThrow(id);
    const updated: Vaccine = {
      ...current,
      ...omitUndefined({
        ...dto,
        medicines: dto.medicines ? this.toMedicines(dto.medicines) : undefined,
      }),
      ...touchBaseFields(this.tenantContext.getUserId()),
    };
    await this.collection().doc(id).set(updated);
    await this.audit.record({ action: AuditAction.VACCINE_UPDATED, entity: 'vaccine', entityId: id });
    return updated;
  }

  async softDelete(id: string): Promise<void> {
    await this.getByIdOrThrow(id);
    await this.collection().doc(id).update({
      deletedAt: new Date().toISOString(),
      ...touchBaseFields(this.tenantContext.getUserId()),
    });
    await this.audit.record({ action: AuditAction.VACCINE_DELETED, entity: 'vaccine', entityId: id });
  }

  async isUsedBySchedule(id: string): Promise<boolean> {
    const snapshot = await this.collection(TENANT_COLLECTION.vaccineSchedules)
      .where('vaccineId', '==', id)
      .where('deletedAt', '==', null)
      .limit(1)
      .get();
    return !snapshot.empty;
  }

  private toFields(dto: CreateVaccineDto) {
    return {
      name: dto.name,
      animalType: dto.animalType ?? null,
      timeDone: dto.timeDone,
      renewal: dto.renewal,
      required: dto.required ?? false,
      totalSaleAmount: dto.totalSaleAmount ?? 0,
      medicines: this.toMedicines(dto.medicines),
    };
  }

  private toMedicines(medicines: VaccineMedicineDto[]): VaccineMedicine[] {
    return medicines.map((medicine) => ({
      productId: medicine.productId,
      quantity: medicine.quantity,
      salesAmount: medicine.salesAmount ?? 0,
      taxId: medicine.taxId ?? null,
      remark: medicine.remark ?? null,
    }));
  }
}
