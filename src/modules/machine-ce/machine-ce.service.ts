import { Injectable } from '@nestjs/common';
import {
  CompleteMachineCeOnboardingDto,
  CreateMachineCeRecordDto,
  MachineCeListQueryDto,
  UpdateMachineCeRecordDto,
} from './machine-ce.dto';
import { MachineCeRepository } from './machine-ce.repository';

@Injectable()
export class MachineCeService {
  constructor(private readonly records: MachineCeRepository) {}

  list(query: MachineCeListQueryDto) {
    return this.records.list(query);
  }
  get(id: string) {
    return this.records.get(id);
  }
  create(dto: CreateMachineCeRecordDto) {
    return this.records.create(dto);
  }
  update(id: string, dto: UpdateMachineCeRecordDto) {
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
  completeOnboarding(dto: CompleteMachineCeOnboardingDto) {
    return this.records.completeOnboarding(dto);
  }
}
