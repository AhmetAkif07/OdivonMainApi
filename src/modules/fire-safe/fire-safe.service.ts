import { Injectable } from '@nestjs/common';
import { CreateFireSafeRecordDto, FireSafeListQueryDto, UpdateFireSafeRecordDto } from './fire-safe.dto';
import { FireSafeRepository } from './fire-safe.repository';

@Injectable()
export class FireSafeService {
  constructor(private readonly records: FireSafeRepository) {}
  list(query: FireSafeListQueryDto) { return this.records.list(query); }
  get(id: string) { return this.records.get(id); }
  create(dto: CreateFireSafeRecordDto) { return this.records.create(dto); }
  update(id: string, dto: UpdateFireSafeRecordDto) { return this.records.update(id, dto); }
  archive(id: string) { return this.records.archive(id); }
  restore(id: string) { return this.records.restore(id); }
}
