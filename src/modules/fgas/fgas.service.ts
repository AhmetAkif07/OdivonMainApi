import { Injectable } from '@nestjs/common';
import {
  CompleteFgasOnboardingDto,
  CreateFgasOperationDto,
  CreateFgasRecordDto,
  FgasListQueryDto,
  FgasOperationListQueryDto,
  UpdateFgasOperationDto,
  UpdateFgasRecordDto,
} from './fgas.dto';
import { FgasOperationKind } from './fgas.types';
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
  allAudit(limit?: number) {
    return this.records.allAudit(limit);
  }
  completeOnboarding(dto: CompleteFgasOnboardingDto) {
    return this.records.completeOnboarding(dto);
  }
  complianceReport(from?: string, to?: string) {
    return this.records.complianceReport(from, to);
  }
  listOperations(kind: FgasOperationKind, query: FgasOperationListQueryDto) {
    return this.records.listOperations(kind, query);
  }
  getOperation(kind: FgasOperationKind, id: string) {
    return this.records.getOperation(kind, id);
  }
  createOperation(kind: FgasOperationKind, dto: CreateFgasOperationDto) {
    return this.records.createOperation(kind, dto);
  }
  updateOperation(kind: FgasOperationKind, id: string, dto: UpdateFgasOperationDto) {
    return this.records.updateOperation(kind, id, dto);
  }
  archiveOperation(kind: FgasOperationKind, id: string) {
    return this.records.setOperationArchive(kind, id, true);
  }
  restoreOperation(kind: FgasOperationKind, id: string) {
    return this.records.setOperationArchive(kind, id, false);
  }
}
