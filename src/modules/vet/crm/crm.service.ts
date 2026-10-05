import { Injectable } from '@nestjs/common';
import { CrmRepository } from './crm.repository';
import { CreateCommunicationLogDto } from './dto/create-communication-log.dto';
import { ListCommunicationLogsQueryDto } from './dto/list-communication-logs.query.dto';
import { CommunicationLog } from './entities/communication-log.entity';

@Injectable()
export class CrmService {
  constructor(private readonly repo: CrmRepository) {}

  async listLogs(query: ListCommunicationLogsQueryDto) {
    return this.repo.listLogs(query);
  }

  async createLog(dto: CreateCommunicationLogDto): Promise<CommunicationLog> {
    return this.repo.createLog(dto);
  }

  async getReminderCandidates() {
    return this.repo.getReminderCandidates();
  }

  async getPetVetSummary() {
    return this.repo.getPetVetSummary();
  }

  async getPetVetExportData() {
    return this.repo.getPetVetExportData();
  }
}
