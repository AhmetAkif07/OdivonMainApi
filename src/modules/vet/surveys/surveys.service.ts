import { randomBytes } from 'crypto';
import { Injectable } from '@nestjs/common';
import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { omitUndefined } from '../../../shared/firestore/base-document';
import {
  CreateSurveyTemplateDto,
  SendSurveyDto,
  SubmitSurveyDto,
  SurveyInviteQueryDto,
  UpdateSurveyTemplateDto,
} from './survey.dto';
import { PublicSurveyView, SurveyInvite, SurveyQuestion, SurveySummary, SurveyTemplate } from './survey.entity';
import { normalizeQuestions, summarize, validateAnswers } from './survey.logic';
import { SurveysRepository } from './surveys.repository';

const DEFAULT_EXPIRY_DAYS = 14;
const MAX_LIST = 500;

function newToken(): string {
  return randomBytes(18).toString('base64url');
}

function dayStart(date: string): string {
  return `${date.slice(0, 10)}T00:00:00.000Z`;
}

function dayEnd(date: string): string {
  return `${date.slice(0, 10)}T23:59:59.999Z`;
}

@Injectable()
export class SurveysService {
  constructor(private readonly repo: SurveysRepository) {}

  // ── Templates ─────────────────────────────────────────────

  listTemplates(): Promise<SurveyTemplate[]> {
    return this.repo.listTemplates();
  }

  getTemplate(id: string): Promise<SurveyTemplate> {
    return this.repo.getTemplateOrThrow(id);
  }

  createTemplate(dto: CreateSurveyTemplateDto): Promise<SurveyTemplate> {
    return this.repo.createTemplate({
      name: dto.name.trim(),
      description: dto.description?.trim() || null,
      thankYouMessage: dto.thankYouMessage?.trim() || null,
      questions: normalizeQuestions(dto.questions as SurveyQuestion[], () => this.repo.newId()),
      active: dto.active ?? true,
    });
  }

  async updateTemplate(id: string, dto: UpdateSurveyTemplateDto): Promise<SurveyTemplate> {
    const current = await this.repo.getTemplateOrThrow(id);
    return this.repo.saveTemplate({
      ...current,
      ...omitUndefined({
        name: dto.name?.trim(),
        description: dto.description === undefined ? undefined : dto.description?.trim() || null,
        thankYouMessage: dto.thankYouMessage === undefined ? undefined : dto.thankYouMessage?.trim() || null,
        questions: dto.questions
          ? normalizeQuestions(dto.questions as SurveyQuestion[], () => this.repo.newId())
          : undefined,
        active: dto.active,
      }),
    });
  }

  async removeTemplate(id: string): Promise<void> {
    await this.repo.deleteTemplate(await this.repo.getTemplateOrThrow(id));
  }

  // ── Sending ───────────────────────────────────────────────

  async send(dto: SendSurveyDto): Promise<SurveyInvite> {
    const template = await this.repo.getTemplateOrThrow(dto.templateId);
    if (!template.active) {
      throw new AppException(ErrorCode.SURVEY_INVALID, 'Pasif bir anket gönderilemez');
    }
    const names = await this.repo.customerAndPatient(dto.customerId, dto.patientId || null);
    if (!names) {
      throw new AppException(ErrorCode.CUSTOMER_INVALID, 'Müşteri bulunamadı');
    }
    const days = dto.expiresInDays ?? DEFAULT_EXPIRY_DAYS;
    return this.repo.createInvite({
      templateId: template.id,
      templateName: template.name,
      questions: template.questions,
      thankYouMessage: template.thankYouMessage,
      customerId: dto.customerId,
      customerName: names.customerName,
      customerPhone: names.customerPhone,
      patientId: names.patientName ? dto.patientId || null : null,
      patientName: names.patientName,
      appointmentId: dto.appointmentId || null,
      token: newToken(),
      status: 'sent',
      expiresAt: new Date(Date.now() + days * 86_400_000).toISOString(),
      answeredAt: null,
      answers: null,
      comment: null,
    });
  }

  private async filteredInvites(query: SurveyInviteQueryDto): Promise<SurveyInvite[]> {
    const items = await this.repo.listInvites(query.from ? dayStart(query.from) : undefined);
    const to = query.to ? dayEnd(query.to) : null;
    return items
      .filter((item) => !query.templateId || item.templateId === query.templateId)
      .filter((item) => !query.customerId || item.customerId === query.customerId)
      .filter((item) => !to || item.createdAt <= to)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async listInvites(query: SurveyInviteQueryDto): Promise<SurveyInvite[]> {
    const items = await this.filteredInvites(query);
    return items.filter((item) => !query.status || item.status === query.status).slice(0, MAX_LIST);
  }

  getInvite(id: string): Promise<SurveyInvite> {
    return this.repo.getInviteOrThrow(id);
  }

  async cancelInvite(id: string): Promise<SurveyInvite> {
    const invite = await this.repo.getInviteOrThrow(id);
    if (invite.status === 'answered') {
      throw new AppException(ErrorCode.SURVEY_ALREADY_ANSWERED, 'Yanıtlanmış anket iptal edilemez');
    }
    return this.repo.cancelInvite(invite);
  }

  async summary(query: SurveyInviteQueryDto): Promise<SurveySummary> {
    return summarize(await this.filteredInvites(query), query.templateId ?? null);
  }

  // ── Public link ───────────────────────────────────────────

  private async resolve(token: string) {
    const lookup = token ? await this.repo.findLookup(token) : null;
    const invite = lookup && !lookup.cancelled ? await this.repo.findInviteForTenant(lookup.tenantId, lookup.inviteId) : null;
    if (!lookup || !invite || invite.status === 'cancelled') {
      throw new AppException(ErrorCode.SURVEY_LINK_INVALID, 'Anket bağlantısı geçersiz');
    }
    return { lookup, invite };
  }

  async publicView(token: string): Promise<PublicSurveyView> {
    const { lookup, invite } = await this.resolve(token);
    const branding = await this.repo.tenantBranding(lookup.tenantId);
    return {
      clinicName: branding.name,
      logoUrl: branding.logoUrl,
      templateName: invite.templateName,
      customerFirstName: invite.customerName.split(' ')[0] ?? '',
      patientName: invite.patientName,
      questions: invite.questions,
      answered: invite.status === 'answered',
      expired: invite.expiresAt < new Date().toISOString(),
      thankYouMessage: invite.thankYouMessage,
    };
  }

  async submit(token: string, dto: SubmitSurveyDto): Promise<{ ok: true; thankYouMessage: string | null }> {
    const updated = await this.repo.submitAnswers(token, (invite) => ({
      ...invite,
      answers: validateAnswers(invite.questions, dto.answers),
      comment: dto.comment?.trim().slice(0, 2000) || null,
      status: 'answered',
      answeredAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    return { ok: true, thankYouMessage: updated.thankYouMessage };
  }
}
