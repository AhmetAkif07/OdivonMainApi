import { Injectable } from '@nestjs/common';
import {
  CompleteFoodLabelOnboardingDto,
  CreateFoodLabelRecordDto,
  FoodLabelListQueryDto,
  UpdateFoodLabelRecordDto,
} from './food-label.dto';
import { FoodLabelRepository } from './food-label.repository';

@Injectable()
export class FoodLabelService {
  constructor(private readonly records: FoodLabelRepository) {}
  list(query: FoodLabelListQueryDto) {
    return this.records.list(query);
  }
  get(id: string) {
    return this.records.get(id);
  }
  create(dto: CreateFoodLabelRecordDto) {
    return this.records.create(dto);
  }
  update(id: string, dto: UpdateFoodLabelRecordDto) {
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
  allAudit(limit?: number) {
    return this.records.allAudit(limit);
  }
  entitlements() {
    return this.records.entitlements();
  }
  complianceReport() {
    return this.records.complianceReport();
  }
  completeOnboarding(dto: CompleteFoodLabelOnboardingDto) {
    return this.records.completeOnboarding(dto);
  }
}
