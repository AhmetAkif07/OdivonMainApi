import { Injectable } from '@nestjs/common';
import { PaginatedResult } from '../../../shared/http/paginated.result';
import { paginateInMemory } from '../../../shared/http/paginate-memory';
import { PagingQueryDto } from '../../../shared/http/paging.dto';
import { PatchGymInfoDto, UpsertGymInfoDto } from './gym-info.dto';
import { GymInfoRepository } from './gym-info.repository';

@Injectable()
export class GymInfoService {
  constructor(private readonly info: GymInfoRepository) {}

  get() {
    return this.info.find();
  }

  upsert(dto: UpsertGymInfoDto | PatchGymInfoDto) {
    return this.info.upsert(dto);
  }

  async list(query: PagingQueryDto): Promise<PaginatedResult<unknown>> {
    const item = await this.info.find();
    return paginateInMemory(item ? [item] : [], query.limit, query.cursor);
  }
}
