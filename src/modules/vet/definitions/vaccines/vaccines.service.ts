import { Injectable } from '@nestjs/common';
import { AppException } from '../../../../shared/errors/app.exception';
import { ErrorCode } from '../../../../shared/errors/error-codes';
import { matchesColumnFilters } from '../../../../shared/http/column-filters';
import { paginateInMemory } from '../../../../shared/http/paginate-memory';
import { PaginatedResult } from '../../../../shared/http/paginated.result';
import { PagingQueryDto } from '../../../../shared/http/paging.dto';
import { ProductsRepository } from '../products/products.repository';
import { TaxesRepository } from '../taxes/taxes.repository';
import { CreateVaccineDto, UpdateVaccineDto, VaccineMedicineDto } from './vaccine.dto';
import { Vaccine, VaccineListItem } from './vaccine.entity';
import { VaccinesRepository } from './vaccines.repository';

@Injectable()
export class VaccinesService {
  constructor(
    private readonly vaccines: VaccinesRepository,
    private readonly products: ProductsRepository,
    private readonly taxes: TaxesRepository,
  ) {}

  async create(dto: CreateVaccineDto): Promise<Vaccine> {
    await this.assertMedicines(dto.medicines);
    return this.vaccines.create(dto);
  }

  getById(id: string): Promise<Vaccine> {
    return this.vaccines.getByIdOrThrow(id);
  }

  async list(query: PagingQueryDto): Promise<PaginatedResult<VaccineListItem>> {
    const items = (await this.withNames(await this.vaccines.collect())).filter((item) =>
      matchesColumnFilters(item, query.filters),
    );
    return paginateInMemory(items, query.limit, query.cursor);
  }

  async update(id: string, dto: UpdateVaccineDto): Promise<Vaccine> {
    if (dto.medicines) {
      await this.assertMedicines(dto.medicines);
    }
    return this.vaccines.update(id, dto);
  }

  async softDelete(id: string): Promise<void> {
    await this.vaccines.getByIdOrThrow(id);
    if (await this.vaccines.isUsedBySchedule(id)) {
      throw new AppException(
        ErrorCode.DEFINITION_IN_USE,
        'Bu aşı bir hasta takviminde kullanılıyor; önce takvim kaydını silin.',
      );
    }
    await this.vaccines.softDelete(id);
  }

  private async assertMedicines(medicines: VaccineMedicineDto[]): Promise<void> {
    for (const medicine of medicines) {
      if (!(await this.products.findById(medicine.productId))) {
        throw new AppException(ErrorCode.DEFINITION_INVALID, 'Seçilen ürün bulunamadı');
      }
      if (medicine.taxId && !(await this.taxes.findById(medicine.taxId))) {
        throw new AppException(ErrorCode.DEFINITION_INVALID, 'Seçilen KDV oranı bulunamadı');
      }
    }
  }

  private async withNames(items: Vaccine[]): Promise<VaccineListItem[]> {
    const medicines = items.flatMap((item) => item.medicines ?? []);
    const [products, taxes] = await Promise.all([
      this.products.findByIds(medicines.map((item) => item.productId)),
      this.taxes.findByIds(medicines.map((item) => item.taxId)),
    ]);
    return items.map((item) => ({
      ...item,
      medicines: (item.medicines ?? []).map((medicine) => ({
        ...medicine,
        productName: products.get(medicine.productId)?.name ?? '',
        taxName: medicine.taxId ? (taxes.get(medicine.taxId)?.name ?? '') : '',
      })),
    }));
  }
}
