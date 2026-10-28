import { Injectable } from '@nestjs/common';
import { GymMailTemplateRepository } from './gym-mail-template.repository';
import { UpdateGymMailTemplateDto } from './gym-mail-template.dto';
import { GymMailTemplate } from './gym-mail-template.entity';

@Injectable()
export class GymMailTemplateService {
  constructor(private readonly repo: GymMailTemplateRepository) {}

  async getTemplate(): Promise<GymMailTemplate> {
    return this.repo.get();
  }

  async updateTemplate(dto: UpdateGymMailTemplateDto): Promise<GymMailTemplate> {
    return this.repo.save(dto);
  }
}
