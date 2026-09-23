import { Injectable } from '@nestjs/common';
import { AppException } from '../../../../shared/errors/app.exception';
import { ErrorCode } from '../../../../shared/errors/error-codes';
import { matchesColumnFilters } from '../../../../shared/http/column-filters';
import { paginateInMemory } from '../../../../shared/http/paginate-memory';
import { PaginatedResult } from '../../../../shared/http/paginated.result';
import { ProductCategoriesRepository } from '../product-categories/product-categories.repository';
import { DefinitionService } from '../shared/definition.service';
import { StoresRepository } from '../stores/stores.repository';
import { SuppliersRepository } from '../suppliers/suppliers.repository';
import { TaxesRepository } from '../taxes/taxes.repository';
import { UnitsRepository } from '../units/units.repository';
import { CreateProductDto, ListProductsQueryDto, UpdateProductDto } from './product.dto';
import { Product, ProductListItem } from './product.entity';
import { ProductsRepository } from './products.repository';

type ProductReferenceFields = Pick<
  CreateProductDto,
  'categoryId' | 'unitId' | 'taxId' | 'supplierId' | 'storeId'
>;

@Injectable()
export class ProductsService extends DefinitionService<Product, CreateProductDto, UpdateProductDto> {
  constructor(
    repository: ProductsRepository,
    private readonly categories: ProductCategoriesRepository,
    private readonly units: UnitsRepository,
    private readonly taxes: TaxesRepository,
    private readonly suppliers: SuppliersRepository,
    private readonly stores: StoresRepository,
  ) {
    super(repository);
  }

  override async list(query: ListProductsQueryDto): Promise<PaginatedResult<ProductListItem>> {
    const items = (await this.repository.collect()).filter((item) =>
      query.productType ? item.productType === query.productType : true,
    );
    const enriched = (await this.withNames(items)).filter((item) =>
      matchesColumnFilters(item, query.filters),
    );
    return paginateInMemory(enriched, query.limit, query.cursor);
  }

  protected override async validate(dto: ProductReferenceFields): Promise<void> {
    const checks: Array<[string | null | undefined, (id: string) => Promise<unknown>, string]> = [
      [dto.categoryId, (id) => this.categories.findById(id), 'kategori'],
      [dto.unitId, (id) => this.units.findById(id), 'birim'],
      [dto.taxId, (id) => this.taxes.findById(id), 'KDV oranı'],
      [dto.supplierId, (id) => this.suppliers.findById(id), 'tedarikçi'],
      [dto.storeId, (id) => this.stores.findById(id), 'depo'],
    ];
    for (const [id, find, label] of checks) {
      if (id && !(await find(id))) {
        throw new AppException(ErrorCode.DEFINITION_INVALID, `Seçilen ${label} bulunamadı`);
      }
    }
  }

  private async withNames(items: Product[]): Promise<ProductListItem[]> {
    const [categories, units, taxes, suppliers, stores] = await Promise.all([
      this.categories.findByIds(items.map((item) => item.categoryId)),
      this.units.findByIds(items.map((item) => item.unitId)),
      this.taxes.findByIds(items.map((item) => item.taxId)),
      this.suppliers.findByIds(items.map((item) => item.supplierId)),
      this.stores.findByIds(items.map((item) => item.storeId)),
    ]);
    return items.map((item) => ({
      ...item,
      categoryName: (item.categoryId && categories.get(item.categoryId)?.name) || '',
      unitName: (item.unitId && units.get(item.unitId)?.name) || '',
      taxRatio: item.taxId ? (taxes.get(item.taxId)?.ratio ?? null) : null,
      supplierName: (item.supplierId && suppliers.get(item.supplierId)?.name) || '',
      storeName: (item.storeId && stores.get(item.storeId)?.name) || '',
    }));
  }
}
