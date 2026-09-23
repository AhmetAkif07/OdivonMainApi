import { Injectable } from '@nestjs/common';
import { matchesColumnFilters } from '../../../../shared/http/column-filters';
import { paginateInMemory } from '../../../../shared/http/paginate-memory';
import { PagingQueryDto } from '../../../../shared/http/paging.dto';
import { CreateAgendaDto, UpdateAgendaDto } from './agenda.dto';
import { AgendaRepository } from './agenda.repository';

@Injectable()
export class AgendaService {
  constructor(private readonly agenda: AgendaRepository) {}

  create(dto: CreateAgendaDto) {
    return this.agenda.create(dto);
  }

  getById(id: string) {
    return this.agenda.getByIdOrThrow(id);
  }

  async list(query: PagingQueryDto) {
    const items = (await this.agenda.collect()).filter((item) => matchesColumnFilters(item, query.filters));
    return paginateInMemory(items, query.limit, query.cursor);
  }

  update(id: string, dto: UpdateAgendaDto) {
    return this.agenda.update(id, dto);
  }

  softDelete(id: string) {
    return this.agenda.softDelete(id);
  }
}
