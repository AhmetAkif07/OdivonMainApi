import { Injectable } from '@nestjs/common';
import { ConsentFormsRepository } from './consent-forms.repository';
import { CreateConsentFormDto } from './dto/create-consent-form.dto';
import { ListConsentFormsQueryDto } from './dto/list-consent-forms.query.dto';
import { UpdateConsentFormDto } from './dto/update-consent-form.dto';
import { ConsentForm } from './entities/consent-form.entity';

@Injectable()
export class ConsentFormsService {
  constructor(private readonly repo: ConsentFormsRepository) {}

  async list(query: ListConsentFormsQueryDto) {
    return this.repo.list(query);
  }

  async getById(id: string): Promise<ConsentForm> {
    return this.repo.getByIdOrThrow(id);
  }

  async create(dto: CreateConsentFormDto): Promise<ConsentForm> {
    return this.repo.create(dto);
  }

  async update(id: string, dto: UpdateConsentFormDto): Promise<ConsentForm> {
    return this.repo.update(id, dto);
  }

  async softDelete(id: string): Promise<void> {
    return this.repo.softDelete(id);
  }
}
