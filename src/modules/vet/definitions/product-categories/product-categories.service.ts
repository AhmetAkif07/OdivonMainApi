import { Injectable } from '@nestjs/common';
import { TENANT_COLLECTION } from '../../../../shared/firebase/firestore-path';
import { DefinitionService } from '../shared/definition.service';
import { ProductCategoriesRepository } from './product-categories.repository';
import { CreateProductCategoryDto, UpdateProductCategoryDto } from './product-category.dto';
import { ProductCategory } from './product-category.entity';

@Injectable()
export class ProductCategoriesService extends DefinitionService<
  ProductCategory,
  CreateProductCategoryDto,
  UpdateProductCategoryDto
> {
  protected override readonly references = [
    { collection: TENANT_COLLECTION.products, field: 'categoryId', label: 'ürün' },
  ];

  constructor(repository: ProductCategoriesRepository) {
    super(repository);
  }
}
