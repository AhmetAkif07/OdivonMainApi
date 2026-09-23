import { Injectable } from '@nestjs/common';
import { AuditService } from '../../../../shared/audit/audit.service';
import { AuditAction } from '../../../../shared/audit/audit.types';
import { ErrorCode } from '../../../../shared/errors/error-codes';
import { FirebaseService } from '../../../../shared/firebase/firebase.service';
import { TENANT_COLLECTION } from '../../../../shared/firebase/firestore-path';
import { TenantContext } from '../../../../shared/tenancy/tenant.context';
import { DefinitionRepository } from '../shared/definition.repository';
import { CreateProductCategoryDto, UpdateProductCategoryDto } from './product-category.dto';
import { ProductCategory } from './product-category.entity';

@Injectable()
export class ProductCategoriesRepository extends DefinitionRepository<
  ProductCategory,
  CreateProductCategoryDto,
  UpdateProductCategoryDto
> {
  protected readonly config = {
    collection: TENANT_COLLECTION.productCategories,
    entity: 'productCategory',
    notFound: ErrorCode.PRODUCT_CATEGORY_NOT_FOUND,
    notFoundMessage: 'Product category not found',
    actions: {
      created: AuditAction.PRODUCT_CATEGORY_CREATED,
      updated: AuditAction.PRODUCT_CATEGORY_UPDATED,
      deleted: AuditAction.PRODUCT_CATEGORY_DELETED,
    },
  };

  constructor(firebase: FirebaseService, tenantContext: TenantContext, audit: AuditService) {
    super(firebase, tenantContext, audit);
  }

  protected toFields(dto: CreateProductCategoryDto) {
    return { name: dto.name, code: dto.code ?? null };
  }
}
