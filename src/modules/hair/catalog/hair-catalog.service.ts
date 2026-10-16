import { Injectable } from '@nestjs/common';
import { TENANT_COLLECTION } from '../../../shared/firebase/firestore-path';
import { hairInvalid, hairNotFound, hairPrecondition } from '../shared/hair-errors';
import { HairListQueryDto, searchTerm } from '../shared/hair-list.dto';
import { HairStore } from '../shared/hair-store';
import { dateIdInTz } from '../shared/hair-time';
import { matchesSearch, num } from '../shared/hair-tx';
import {
  CreateHairProductDto,
  CreateHairServiceCategoryDto,
  CreateHairServiceDto,
  UpdateHairProductDto,
  UpdateHairServiceCategoryDto,
  UpdateHairServiceDto,
} from './catalog.dto';

const CATEGORY_NOT_FOUND = 'Hizmet kategorisi bulunamadı.';
const SERVICE_NOT_FOUND = 'Hizmet bulunamadı.';
const PRODUCT_NOT_FOUND = 'Ürün bulunamadı.';

@Injectable()
export class HairCatalogService {
  constructor(private readonly store: HairStore) {}

  // ── Service categories ──

  listCategories(query: HairListQueryDto) {
    return this.store.list(TENANT_COLLECTION.hairServiceCategories, {
      orderBy: { field: 'sortOrder', dir: 'asc' },
      limit: query.limit ?? 200,
      cursor: query.cursor,
    });
  }

  createCategory(dto: CreateHairServiceCategoryDto) {
    return this.store.create(TENANT_COLLECTION.hairServiceCategories, 'hairServiceCategories', {
      ...dto,
      name: dto.name.trim(),
      sortOrder: dto.sortOrder ?? 0,
      active: dto.active ?? true,
    });
  }

  updateCategory(id: string, dto: UpdateHairServiceCategoryDto) {
    return this.store.update(
      TENANT_COLLECTION.hairServiceCategories,
      'hairServiceCategories',
      id,
      { ...dto, name: dto.name?.trim() },
      CATEGORY_NOT_FOUND,
    );
  }

  async removeCategory(id: string) {
    const used = await this.store.rows(TENANT_COLLECTION.hairServices, { field: 'categoryId', op: '==', value: id });
    if (used.length > 0) {
      throw hairPrecondition(`Bu kategoride ${used.length} hizmet var; önce hizmetleri taşıyın veya silin.`);
    }
    return this.store.softDelete(TENANT_COLLECTION.hairServiceCategories, 'hairServiceCategories', id, CATEGORY_NOT_FOUND);
  }

  // ── Services ──

  async listServices(query: HairListQueryDto) {
    if (query.branchId) this.store.assertBranchAccess(await this.store.actorOrThrow(), query.branchId);
    const term = searchTerm(query);
    return this.store.list(TENANT_COLLECTION.hairServices, {
      equals: { categoryId: query.categoryId },
      match: (item) => {
        const branches = Array.isArray(item['branchIds']) ? (item['branchIds'] as string[]) : [];
        const inBranch = !query.branchId || branches.length === 0 || branches.includes(query.branchId);
        const staffIds = Array.isArray(item['staffIds']) ? (item['staffIds'] as string[]) : [];
        const byStaff = !query.staffId || staffIds.length === 0 || staffIds.includes(query.staffId);
        const status = query.status ? (query.status === 'active') === (item['active'] !== false) : true;
        return inBranch && byStaff && status && matchesSearch(item, term, ['name', 'description']);
      },
      orderBy: { field: 'sortOrder', dir: 'asc' },
      limit: query.limit ?? 200,
      cursor: query.cursor,
    });
  }

  getService(id: string) {
    return this.store.getOrThrow(TENANT_COLLECTION.hairServices, id, SERVICE_NOT_FOUND);
  }

  async createService(dto: CreateHairServiceDto) {
    await this.assertServiceRefs(dto);
    assertProcessing(dto.durationMinutes, dto.processingMinutes);
    return this.store.create(TENANT_COLLECTION.hairServices, 'hairServices', {
      ...dto,
      name: dto.name.trim(),
      requiresFormula: dto.requiresFormula ?? false,
      productsUsed: dto.productsUsed ?? [],
      branchIds: dto.branchIds ?? [],
      staffIds: dto.staffIds ?? [],
      onlineBookable: dto.onlineBookable ?? true,
      sortOrder: dto.sortOrder ?? 0,
      active: dto.active ?? true,
    });
  }

  async updateService(id: string, dto: UpdateHairServiceDto) {
    const current = await this.getService(id);
    await this.assertServiceRefs(dto);
    assertProcessing(
      dto.durationMinutes ?? num(current['durationMinutes']),
      dto.processingMinutes ?? num(current['processingMinutes']),
    );
    return this.store.update(
      TENANT_COLLECTION.hairServices,
      'hairServices',
      id,
      { ...dto, name: dto.name?.trim() },
      SERVICE_NOT_FOUND,
    );
  }

  removeService(id: string) {
    return this.store.softDelete(TENANT_COLLECTION.hairServices, 'hairServices', id, SERVICE_NOT_FOUND);
  }

  // ── Products ──

  async listProducts(query: HairListQueryDto) {
    const actor = await this.store.actorOrThrow();
    const branchIds = query.branchId ? [query.branchId] : actor.branchIds;
    if (query.branchId) this.store.assertBranchAccess(actor, query.branchId);
    const term = searchTerm(query);
    return this.store.list(TENANT_COLLECTION.hairProducts, {
      match: (item) => {
        const branch = item['branchId'] as string | undefined;
        // Products without a branch live in the general store and are visible to everyone.
        const inBranch = !branchIds || !branch || branchIds.includes(branch);
        const byCategory = !query.categoryId || item['category'] === query.categoryId;
        const lowOnly = query.status !== 'low' || num(item['currentStock']) <= num(item['minStock']);
        return inBranch && byCategory && lowOnly && matchesSearch(item, term, ['name', 'brand', 'barcode', 'category']);
      },
      orderBy: { field: 'name', dir: 'asc' },
      limit: query.limit ?? 200,
      cursor: query.cursor,
    });
  }

  getProduct(id: string) {
    return this.store.getOrThrow(TENANT_COLLECTION.hairProducts, id, PRODUCT_NOT_FOUND);
  }

  /** Creates the product; an opening stock is also written as an `in` inventory transaction (S-004). */
  async createProduct(dto: CreateHairProductDto) {
    if (dto.branchId) await this.store.getOrThrow(TENANT_COLLECTION.hairBranches, dto.branchId, 'Şube bulunamadı.');
    const product = await this.store.create(TENANT_COLLECTION.hairProducts, 'hairProducts', {
      ...dto,
      name: dto.name.trim(),
      currentStock: dto.currentStock ?? 0,
      active: dto.active ?? true,
    });
    if ((dto.currentStock ?? 0) > 0) {
      await this.store.create(TENANT_COLLECTION.hairInventoryTransactions, 'hairInventoryTransactions', {
        productId: product.id,
        productName: product['name'],
        type: 'in',
        quantity: dto.currentStock,
        delta: dto.currentStock,
        stockAfter: dto.currentStock,
        reason: 'Açılış stoğu',
        branchId: dto.branchId,
        date: dateIdInTz(await this.store.timeZone()),
      });
    }
    return product;
  }

  updateProduct(id: string, dto: UpdateHairProductDto) {
    return this.store.update(
      TENANT_COLLECTION.hairProducts,
      'hairProducts',
      id,
      { ...dto, name: dto.name?.trim() },
      PRODUCT_NOT_FOUND,
    );
  }

  removeProduct(id: string) {
    return this.store.softDelete(TENANT_COLLECTION.hairProducts, 'hairProducts', id, PRODUCT_NOT_FOUND);
  }

  private async assertServiceRefs(dto: UpdateHairServiceDto) {
    if (dto.categoryId) {
      await this.store.getOrThrow(TENANT_COLLECTION.hairServiceCategories, dto.categoryId, CATEGORY_NOT_FOUND);
    }
    for (const used of dto.productsUsed ?? []) {
      const product = await this.store.find(TENANT_COLLECTION.hairProducts, used.productId);
      if (!product) throw hairNotFound(`Hizmette kullanılan ürün bulunamadı: ${used.productId}`);
    }
  }
}

function assertProcessing(duration: number, processing: number | undefined) {
  if (processing && processing >= duration) {
    throw hairInvalid('Bekleme süresi hizmet süresinden kısa olmalıdır.');
  }
}
