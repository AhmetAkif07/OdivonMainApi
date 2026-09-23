import { Injectable } from '@nestjs/common';
import { AuditService } from '../../../../shared/audit/audit.service';
import { AuditAction } from '../../../../shared/audit/audit.types';
import { ErrorCode } from '../../../../shared/errors/error-codes';
import { FirebaseService } from '../../../../shared/firebase/firebase.service';
import { TENANT_COLLECTION } from '../../../../shared/firebase/firestore-path';
import { TenantContext } from '../../../../shared/tenancy/tenant.context';
import { DefinitionRepository } from '../shared/definition.repository';
import { CreateUnitDto, UpdateUnitDto } from './unit.dto';
import { Unit } from './unit.entity';

@Injectable()
export class UnitsRepository extends DefinitionRepository<Unit, CreateUnitDto, UpdateUnitDto> {
  protected readonly config = {
    collection: TENANT_COLLECTION.units,
    entity: 'unit',
    notFound: ErrorCode.UNIT_NOT_FOUND,
    notFoundMessage: 'Unit not found',
    actions: {
      created: AuditAction.UNIT_CREATED,
      updated: AuditAction.UNIT_UPDATED,
      deleted: AuditAction.UNIT_DELETED,
    },
  };

  constructor(firebase: FirebaseService, tenantContext: TenantContext, audit: AuditService) {
    super(firebase, tenantContext, audit);
  }

  protected toFields(dto: CreateUnitDto) {
    return { name: dto.name, code: dto.code ?? null };
  }
}
