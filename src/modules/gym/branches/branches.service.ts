import { Injectable } from '@nestjs/common';
import { PaginatedResult } from '../../../shared/http/paginated.result';
import { paginateInMemory } from '../../../shared/http/paginate-memory';
import { PagingQueryDto } from '../../../shared/http/paging.dto';
import { CreateBranchDto, UpdateBranchDto } from './branch.dto';
import { BranchesRepository } from './branches.repository';

@Injectable()
export class BranchesService {
  constructor(private readonly branches: BranchesRepository) {}

  create(dto: CreateBranchDto) {
    return this.branches.create(dto);
  }

  getById(id: string) {
    return this.branches.getByIdOrThrow(id);
  }

  async list(query: PagingQueryDto) {
    const items = await this.branches.list();
    return paginateInMemory(items, query.limit ?? 100, query.cursor);
  }

  update(id: string, dto: UpdateBranchDto) {
    return this.branches.update(id, dto);
  }

  async remove(id: string): Promise<PaginatedResult<never> | { id: string }> {
    await this.branches.softDelete(id);
    return { id };
  }
}
