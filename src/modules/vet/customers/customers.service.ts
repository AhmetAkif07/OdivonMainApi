import { Injectable } from '@nestjs/common';
import { FirebaseService } from '../../../shared/firebase/firebase.service';
import { TENANT_COLLECTION, tenantCollectionPath } from '../../../shared/firebase/firestore-path';
import { createBaseFields } from '../../../shared/firestore/base-document';
import { TenantContext } from '../../../shared/tenancy/tenant.context';
import { AuditService } from '../../../shared/audit/audit.service';
import { AuditAction } from '../../../shared/audit/audit.types';
import { PatientsRepository } from '../patients/patients.repository';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { ListCustomersQueryDto } from './dto/list-customers.query.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { Customer } from './entities/customer.entity';
import { CustomersRepository } from './customers.repository';
import { Patient } from '../patients/entities/patient.entity';

@Injectable()
export class CustomersService {
  constructor(
    private readonly customers: CustomersRepository,
    private readonly patients: PatientsRepository,
    private readonly firebase: FirebaseService,
    private readonly tenantContext: TenantContext,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateCustomerDto): Promise<{ customer: Customer; patient?: Patient }> {
    if (!dto.initialPatient) {
      const customer = await this.customers.create(dto);
      return { customer };
    }

    const tenantId = this.tenantContext.getTenantId();
    const userId = this.tenantContext.getUserId();
    const customerRef = this.firebase.db
      .collection(tenantCollectionPath(tenantId, TENANT_COLLECTION.customers))
      .doc();
    const patientRef = this.firebase.db
      .collection(tenantCollectionPath(tenantId, TENANT_COLLECTION.patients))
      .doc();

    const customer: Customer = {
      ...createBaseFields(customerRef.id, userId),
      firstName: dto.firstName,
      lastName: dto.lastName,
      phone: dto.phone,
      email: dto.email ?? null,
      address: dto.address ?? null,
      note: dto.note ?? null,
      discountRate: dto.discountRate ?? 0,
      isArchive: false,
    };
    const patient = this.patients.toPatient(patientRef.id, {
      ...dto.initialPatient,
      customerId: customer.id,
    });

    const batch = this.firebase.db.batch();
    batch.set(customerRef, customer);
    batch.set(patientRef, patient);
    await batch.commit();

    await this.audit.record({
      action: AuditAction.CUSTOMER_CREATED,
      entity: 'customer',
      entityId: customer.id,
    });
    await this.audit.record({
      action: AuditAction.PATIENT_CREATED,
      entity: 'patient',
      entityId: patient.id,
    });

    return { customer, patient };
  }

  getById(id: string) {
    return this.customers.getByIdOrThrow(id);
  }

  list(query: ListCustomersQueryDto) {
    return this.customers.list(query);
  }

  update(id: string, dto: UpdateCustomerDto) {
    return this.customers.update(id, dto);
  }

  softDelete(id: string) {
    return this.customers.softDelete(id);
  }
}
