import { Injectable } from '@nestjs/common';
import { MachineCeAiService } from './machine-ce-ai.service';
import {
  AiAnalyzeMachineDto,
  AiCopilotAskDto,
  BulkCreateMachineCeRecordsDto,
  CompleteMachineCeOnboardingDto,
  CreateMachineCeRecordDto,
  MachineCeListQueryDto,
  UpdateMachineCeRecordDto,
  UploadMachineCeAttachmentDto,
} from './machine-ce.dto';
import { MachineCeRepository } from './machine-ce.repository';

@Injectable()
export class MachineCeService {
  constructor(
    private readonly records: MachineCeRepository,
    private readonly ai: MachineCeAiService,
  ) {}

  list(query: MachineCeListQueryDto) {
    return this.records.list(query);
  }
  get(id: string) {
    return this.records.get(id);
  }
  create(dto: CreateMachineCeRecordDto) {
    return this.records.create(dto);
  }
  bulkCreate(dto: BulkCreateMachineCeRecordsDto) {
    return this.records.bulkCreate(dto);
  }
  uploadAttachment(recordId: string, dto: UploadMachineCeAttachmentDto) {
    return this.records.uploadAttachment(recordId, dto);
  }
  getAttachment(recordId: string, attachmentId: string) {
    return this.records.getAttachment(recordId, attachmentId);
  }
  deleteAttachment(recordId: string, attachmentId: string) {
    return this.records.deleteAttachment(recordId, attachmentId);
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
  analyzeMachine(dto: AiAnalyzeMachineDto) {
    return this.ai.analyzeMachine(dto);
  }
  async auditPortfolio() {
    const list = await this.records.list({ archived: false, limit: 100 });
    return this.ai.auditPortfolio(list.items);
  }
  askCopilot(dto: AiCopilotAskDto) {
    return this.ai.askCopilot(dto);
  }
}
