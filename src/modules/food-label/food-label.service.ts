import { Injectable } from '@nestjs/common';
import { CreateFoodLabelRecordDto, FoodLabelListQueryDto, UpdateFoodLabelRecordDto } from './food-label.dto';
import { FoodLabelRepository } from './food-label.repository';

@Injectable()
export class FoodLabelService {
  constructor(private readonly records: FoodLabelRepository) {}
  list(query: FoodLabelListQueryDto) { return this.records.list(query); }
  get(id: string) { return this.records.get(id); }
  create(dto: CreateFoodLabelRecordDto) { return this.records.create(dto); }
  update(id: string, dto: UpdateFoodLabelRecordDto) { return this.records.update(id, dto); }
  archive(id: string) { return this.records.archive(id); }
  restore(id: string) { return this.records.restore(id); }
}
