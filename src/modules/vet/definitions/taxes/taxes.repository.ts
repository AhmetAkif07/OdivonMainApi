import { Injectable } from '@nestjs/common';
import { AuditService } from '../../../../shared/audit/audit.service';
import { AuditAction } from '../../../../shared/audit/audit.types';
import { ErrorCode } from '../../../../shared/errors/error-codes';
import { FirebaseService } from '../../../../shared/firebase/firebase.service';
import { TENANT_COLLECTION } from '../../../../shared/firebase/firestore-path';
import { TenantContext } from '../../../../shared/tenancy/tenant.context';
import { DefinitionRepository } from '../shared/definition.repository';
import { CreateTaxDto, UpdateTaxDto } from './tax.dto';
import { Tax } from './tax.entity';

@Injectable()
export class TaxesRepository extends DefinitionRepository<Tax, CreateTaxDto, UpdateTaxDto> {
  protected readonly config = {
    collection: TENANT_COLLECTION.taxes,
    entity: 'tax',
    notFound: ErrorCode.TAX_NOT_FOUND,
    notFoundMessage: 'Tax not found',
    actions: {
      created: AuditAction.TAX_CREATED,
      updated: AuditAction.TAX_UPDATED,
      deleted: AuditAction.TAX_DELETED,
    },
  };

  constructor(firebase: FirebaseService, tenantContext: TenantContext, audit: AuditService) {
    super(firebase, tenantContext, audit);
  }

  protected toFields(dto: CreateTaxDto) {
    return { name: dto.name, ratio: dto.ratio, type: dto.type ?? 'both' };
  }
}
