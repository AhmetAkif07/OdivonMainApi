import { Injectable } from '@nestjs/common';
import { AuditService } from '../../../../shared/audit/audit.service';
import { AuditAction } from '../../../../shared/audit/audit.types';
import { ErrorCode } from '../../../../shared/errors/error-codes';
import { FirebaseService } from '../../../../shared/firebase/firebase.service';
import { TENANT_COLLECTION } from '../../../../shared/firebase/firestore-path';
import { TenantContext } from '../../../../shared/tenancy/tenant.context';
import { DefinitionRepository } from '../shared/definition.repository';
import { CreateStoreDto, UpdateStoreDto } from './store.dto';
import { Store } from './store.entity';

@Injectable()
export class StoresRepository extends DefinitionRepository<Store, CreateStoreDto, UpdateStoreDto> {
  protected readonly config = {
    collection: TENANT_COLLECTION.stores,
    entity: 'store',
    notFound: ErrorCode.STORE_NOT_FOUND,
    notFoundMessage: 'Store not found',
    actions: {
      created: AuditAction.STORE_CREATED,
      updated: AuditAction.STORE_UPDATED,
      deleted: AuditAction.STORE_DELETED,
    },
  };

  constructor(firebase: FirebaseService, tenantContext: TenantContext, audit: AuditService) {
    super(firebase, tenantContext, audit);
  }

  protected toFields(dto: CreateStoreDto) {
    return { name: dto.name, code: dto.code ?? null, active: dto.active ?? true };
  }
}
