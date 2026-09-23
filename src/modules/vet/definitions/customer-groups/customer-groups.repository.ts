import { Injectable } from '@nestjs/common';
import { AuditService } from '../../../../shared/audit/audit.service';
import { AuditAction } from '../../../../shared/audit/audit.types';
import { ErrorCode } from '../../../../shared/errors/error-codes';
import { FirebaseService } from '../../../../shared/firebase/firebase.service';
import { TENANT_COLLECTION } from '../../../../shared/firebase/firestore-path';
import { TenantContext } from '../../../../shared/tenancy/tenant.context';
import { DefinitionRepository } from '../shared/definition.repository';
import { CreateCustomerGroupDto, UpdateCustomerGroupDto } from './customer-group.dto';
import { CustomerGroup } from './customer-group.entity';

@Injectable()
export class CustomerGroupsRepository extends DefinitionRepository<
  CustomerGroup,
  CreateCustomerGroupDto,
  UpdateCustomerGroupDto
> {
  protected readonly config = {
    collection: TENANT_COLLECTION.customerGroups,
    entity: 'customerGroup',
    notFound: ErrorCode.CUSTOMER_GROUP_NOT_FOUND,
    notFoundMessage: 'Customer group not found',
    actions: {
      created: AuditAction.CUSTOMER_GROUP_CREATED,
      updated: AuditAction.CUSTOMER_GROUP_UPDATED,
      deleted: AuditAction.CUSTOMER_GROUP_DELETED,
    },
  };

  constructor(firebase: FirebaseService, tenantContext: TenantContext, audit: AuditService) {
    super(firebase, tenantContext, audit);
  }

  protected toFields(dto: CreateCustomerGroupDto) {
    return { name: dto.name, code: dto.code ?? null };
  }
}
