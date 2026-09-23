import { Injectable } from '@nestjs/common';
import { AuditService } from '../../../../shared/audit/audit.service';
import { AuditAction } from '../../../../shared/audit/audit.types';
import { ErrorCode } from '../../../../shared/errors/error-codes';
import { FirebaseService } from '../../../../shared/firebase/firebase.service';
import { TENANT_COLLECTION } from '../../../../shared/firebase/firestore-path';
import { TenantContext } from '../../../../shared/tenancy/tenant.context';
import { DefinitionRepository } from '../shared/definition.repository';
import { CreateAppointmentTypeDto, UpdateAppointmentTypeDto } from './appointment-type.dto';
import { AppointmentType } from './appointment-type.entity';

@Injectable()
export class AppointmentTypesRepository extends DefinitionRepository<
  AppointmentType,
  CreateAppointmentTypeDto,
  UpdateAppointmentTypeDto
> {
  protected readonly config = {
    collection: TENANT_COLLECTION.appointmentTypes,
    entity: 'appointmentType',
    notFound: ErrorCode.APPOINTMENT_TYPE_NOT_FOUND,
    notFoundMessage: 'Appointment type not found',
    actions: {
      created: AuditAction.APPOINTMENT_TYPE_CREATED,
      updated: AuditAction.APPOINTMENT_TYPE_UPDATED,
      deleted: AuditAction.APPOINTMENT_TYPE_DELETED,
    },
  };

  constructor(firebase: FirebaseService, tenantContext: TenantContext, audit: AuditService) {
    super(firebase, tenantContext, audit);
  }

  protected toFields(dto: CreateAppointmentTypeDto) {
    return {
      name: dto.name,
      remark: dto.remark ?? null,
      price: dto.price ?? 0,
      color: dto.color ?? null,
      taxId: dto.taxId ?? null,
      isDefaultPrice: dto.isDefaultPrice ?? false,
    };
  }
}
