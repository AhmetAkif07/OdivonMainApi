import { Injectable } from '@nestjs/common';
import { paginateInMemory } from '../../../shared/http/paginate-memory';
import { PagingQueryDto } from '../../../shared/http/paging.dto';
import { CreateStaffDto, UpdateStaffDto } from './staff.dto';
import { StaffRepository } from './staff.repository';

@Injectable()
export class StaffService {
  constructor(private readonly staff: StaffRepository) {}

  create(dto: CreateStaffDto) {
    return this.staff.create(dto);
  }

  getById(id: string) {
    return this.staff.getByIdOrThrow(id);
  }

  async list(query: PagingQueryDto) {
    const items = await this.staff.list();
    return paginateInMemory(items, query.limit ?? 100, query.cursor);
  }

  update(id: string, dto: UpdateStaffDto) {
    return this.staff.update(id, dto);
  }

  async remove(id: string) {
    await this.staff.softDelete(id);
    return { id };
  }
}
