import { Injectable } from '@nestjs/common';
import { AuditService } from '../../../../shared/audit/audit.service';
import { AuditAction } from '../../../../shared/audit/audit.types';
import { ErrorCode } from '../../../../shared/errors/error-codes';
import { FirebaseService } from '../../../../shared/firebase/firebase.service';
import { TENANT_COLLECTION } from '../../../../shared/firebase/firestore-path';
import { TenantContext } from '../../../../shared/tenancy/tenant.context';
import { DefinitionRepository } from '../shared/definition.repository';
import { CreateProductDto, UpdateProductDto } from './product.dto';
import { Product } from './product.entity';

@Injectable()
export class ProductsRepository extends DefinitionRepository<Product, CreateProductDto, UpdateProductDto> {
  protected readonly config = {
    collection: TENANT_COLLECTION.products,
    entity: 'product',
    notFound: ErrorCode.PRODUCT_NOT_FOUND,
    notFoundMessage: 'Product not found',
    actions: {
      created: AuditAction.PRODUCT_CREATED,
      updated: AuditAction.PRODUCT_UPDATED,
      deleted: AuditAction.PRODUCT_DELETED,
    },
  };

  constructor(firebase: FirebaseService, tenantContext: TenantContext, audit: AuditService) {
    super(firebase, tenantContext, audit);
  }

  protected toFields(dto: CreateProductDto) {
    return {
      productType: dto.productType,
      name: dto.name,
      code: dto.code ?? null,
      barcode: dto.barcode ?? null,
      categoryId: dto.categoryId ?? null,
      unitId: dto.unitId ?? null,
      taxId: dto.taxId ?? null,
      supplierId: dto.supplierId ?? null,
      storeId: dto.storeId ?? null,
      buyingPrice: dto.buyingPrice ?? 0,
      sellingPrice: dto.sellingPrice ?? 0,
      vatIncluded: dto.vatIncluded ?? true,
      criticalAmount: dto.criticalAmount ?? null,
      animalType: dto.animalType ?? null,
      active: dto.active ?? true,
    };
  }
}
