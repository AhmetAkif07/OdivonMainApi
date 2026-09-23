import { AppException } from '../../../../shared/errors/app.exception';
import { ErrorCode } from '../../../../shared/errors/error-codes';
import { matchesColumnFilters } from '../../../../shared/http/column-filters';
import { paginateInMemory } from '../../../../shared/http/paginate-memory';
import { PaginatedResult } from '../../../../shared/http/paginated.result';
import { PagingQueryDto } from '../../../../shared/http/paging.dto';
import { DefinitionDocument, DefinitionRepository } from './definition.repository';

export interface DefinitionReference {
  collection: string;
  field: string;
  label: string;
}

export abstract class DefinitionService<
  T extends DefinitionDocument,
  C extends object,
  U extends object,
> {
  protected readonly references: DefinitionReference[] = [];

  constructor(protected readonly repository: DefinitionRepository<T, C, U>) {}

  async create(dto: C): Promise<T> {
    await this.validate(dto);
    return this.repository.create(dto);
  }

  getById(id: string): Promise<T> {
    return this.repository.getByIdOrThrow(id);
  }

  async list(query: PagingQueryDto): Promise<PaginatedResult<T>> {
    const items = (await this.repository.collect()).filter((item) =>
      matchesColumnFilters(item, query.filters),
    );
    return paginateInMemory(items, query.limit, query.cursor);
  }

  async update(id: string, dto: U): Promise<T> {
    await this.validate(dto);
    return this.repository.update(id, dto);
  }

  async softDelete(id: string): Promise<void> {
    await this.repository.getByIdOrThrow(id);
    for (const reference of this.references) {
      if (await this.repository.isReferenced(reference.collection, reference.field, id)) {
        throw new AppException(
          ErrorCode.DEFINITION_IN_USE,
          `Bu kayıt bir ${reference.label} tarafından kullanılıyor; önce ilgili kaydı değiştirin.`,
        );
      }
    }
    await this.repository.softDelete(id);
  }

  protected async validate(_dto: C | U): Promise<void> {
    return;
  }
}
