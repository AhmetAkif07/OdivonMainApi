import { Injectable } from '@nestjs/common';
import { AppException } from '../../../../shared/errors/app.exception';
import { ErrorCode } from '../../../../shared/errors/error-codes';
import { matchesColumnFilters } from '../../../../shared/http/column-filters';
import { paginateInMemory } from '../../../../shared/http/paginate-memory';
import { PaginatedResult } from '../../../../shared/http/paginated.result';
import { PagingQueryDto } from '../../../../shared/http/paging.dto';
import { DefinitionService } from '../shared/definition.service';
import { TaxesRepository } from '../taxes/taxes.repository';
import { CreateAppointmentTypeDto, UpdateAppointmentTypeDto } from './appointment-type.dto';
import { AppointmentType, AppointmentTypeListItem } from './appointment-type.entity';
import { AppointmentTypesRepository } from './appointment-types.repository';

@Injectable()
export class AppointmentTypesService extends DefinitionService<
  AppointmentType,
  CreateAppointmentTypeDto,
  UpdateAppointmentTypeDto
> {
  constructor(
    repository: AppointmentTypesRepository,
    private readonly taxes: TaxesRepository,
  ) {
    super(repository);
  }

  override async list(query: PagingQueryDto): Promise<PaginatedResult<AppointmentTypeListItem>> {
    const items = await this.repository.collect();
    const taxes = await this.taxes.findByIds(items.map((item) => item.taxId));
    const enriched = items
      .map((item) => ({ ...item, taxName: item.taxId ? (taxes.get(item.taxId)?.name ?? '') : '' }))
      .filter((item) => matchesColumnFilters(item, query.filters));
    return paginateInMemory(enriched, query.limit, query.cursor);
  }

  protected override async validate(dto: CreateAppointmentTypeDto | UpdateAppointmentTypeDto) {
    if (dto.taxId && !(await this.taxes.findById(dto.taxId))) {
      throw new AppException(ErrorCode.DEFINITION_INVALID, 'Seçilen KDV oranı bulunamadı');
    }
  }
}
