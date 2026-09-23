import { Injectable } from '@nestjs/common';
import { AuditService } from '../../../../shared/audit/audit.service';
import { AuditAction } from '../../../../shared/audit/audit.types';
import { ErrorCode } from '../../../../shared/errors/error-codes';
import { FirebaseService } from '../../../../shared/firebase/firebase.service';
import { TENANT_COLLECTION } from '../../../../shared/firebase/firestore-path';
import { TenantContext } from '../../../../shared/tenancy/tenant.context';
import { DefinitionRepository } from '../shared/definition.repository';
import { CreateSupplierDto, UpdateSupplierDto } from './supplier.dto';
import { Supplier } from './supplier.entity';

@Injectable()
export class SuppliersRepository extends DefinitionRepository<
  Supplier,
  CreateSupplierDto,
  UpdateSupplierDto
> {
  protected readonly config = {
    collection: TENANT_COLLECTION.suppliers,
    entity: 'supplier',
    notFound: ErrorCode.SUPPLIER_NOT_FOUND,
    notFoundMessage: 'Supplier not found',
    actions: {
      created: AuditAction.SUPPLIER_CREATED,
      updated: AuditAction.SUPPLIER_UPDATED,
      deleted: AuditAction.SUPPLIER_DELETED,
    },
  };

  constructor(firebase: FirebaseService, tenantContext: TenantContext, audit: AuditService) {
    super(firebase, tenantContext, audit);
  }

  protected toFields(dto: CreateSupplierDto) {
    return {
      name: dto.name,
      companyName: dto.companyName ?? null,
      email: dto.email ?? null,
      phone: dto.phone ?? null,
      address: dto.address ?? null,
      taxOffice: dto.taxOffice ?? null,
      taxNumber: dto.taxNumber ?? null,
      mersisNo: dto.mersisNo ?? null,
      website: dto.website ?? null,
      invoiceType: dto.invoiceType ?? null,
      active: dto.active ?? true,
    };
  }
}
