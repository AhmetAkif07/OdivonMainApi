import { Injectable } from '@nestjs/common';
import { CreateFgasRecordDto, FgasListQueryDto, UpdateFgasRecordDto } from './fgas.dto';
import { FgasRepository } from './fgas.repository';

@Injectable()
export class FgasService {
  constructor(private readonly records: FgasRepository) {}
  list(query: FgasListQueryDto) {
    return this.records.list(query);
  }
  get(id: string) {
    return this.records.get(id);
  }
  create(dto: CreateFgasRecordDto) {
    return this.records.create(dto);
  }
  update(id: string, dto: UpdateFgasRecordDto) {
    return this.records.update(id, dto);
  }
  archive(id: string) {
    return this.records.archive(id);
  }
  restore(id: string) {
    return this.records.restore(id);
  }
  dashboard() {
    return this.records.dashboard();
  }
  audit(id: string) {
    return this.records.audit(id);
  }
}
