import { createHash } from 'crypto';
import { Injectable } from '@nestjs/common';
import { hasPermission, PermissionAction, PermissionResource } from '../../shared/authorization/permissions';
import { AppException } from '../../shared/errors/app.exception';
import { ErrorCode } from '../../shared/errors/error-codes';
import { omitUndefined } from '../../shared/firestore/base-document';
import { TenantContext } from '../../shared/tenancy/tenant.context';
import { IdentityRepository } from '../identity/identity.repository';
import { DIET_COLLECTIONS as C } from './diet.constants';
import {
  CreateDietClientDto,
  CreateDietConsultationDto,
  CreateDietMeasurementDto,
  CreateDietPlanDto,
  CreateDietRequestDto,
  CreateDietTaskDto,
  ListDietClientsQueryDto,
  ListDietConsultationsQueryDto,
  ListDietMessagesQueryDto,
  ListDietPlansQueryDto,
  ListDietRequestsQueryDto,
  ListDietTasksQueryDto,
  RegisterDietDeviceDto,
  SendDietMessageDto,
  UpdateDietClientDto,
  UpdateDietConsultationDto,
  UpdateDietNotificationPrefsDto,
  UpdateDietPlanDto,
  UpdateDietRequestDto,
  UpdateDietTaskDto,
} from './diet.dto';
import { DietRepository } from './diet.repository';
import {
  DEFAULT_DIET_NOTIFICATION_PREFS,
  DIET_CLIENT_CLINICAL_FIELDS,
  DietClient,
  DietConsultation,
  DietConversation,
  DietDevice,
  DietMeasurement,
  DietMessage,
  DietNotificationPrefs,
  DietPlan,
  DietRequest,
  DietRequestStatus,
  DietTask,
} from './diet.types';

const TIME_ZONE = 'Europe/Istanbul';
const DAY_MS = 86_400_000;
const STALE_MEASUREMENT_DAYS = 14;

const REQUEST_STATUS_LABELS: Record<DietRequestStatus, string> = {
  open: 'Açık',
  in_progress: 'İşlemde',
  resolved: 'Çözüldü',
  rejected: 'Reddedildi',
};

/** Calendar day (YYYY-MM-DD) of an instant in Turkey time. */
export function istanbulDay(value: string | Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(new Date(value));
}

/** Progress from start weight towards target weight, 0–100 (null when start equals target). */
export function goalProgressPct(client: Pick<DietClient, 'startWeightKg' | 'targetWeightKg' | 'currentWeightKg'>): number | null {
  const total = client.startWeightKg - client.targetWeightKg;
  if (Math.abs(total) < 0.01) return null;
  const done = client.startWeightKg - client.currentWeightKg;
  return Math.round(Math.min(100, Math.max(0, (done / total) * 100)));
}

export function fullName(client: Pick<DietClient, 'firstName' | 'lastName'>): string {
  return `${client.firstName} ${client.lastName}`.trim();
}

@Injectable()
export class DietService {
  constructor(
    private readonly repo: DietRepository,
    private readonly tenant: TenantContext,
    private readonly identity: IdentityRepository,
  ) {}

  // ---------- permissions ----------

  private can(resource: PermissionResource, action: PermissionAction): boolean {
    const user = this.tenant.getStore();
    return user.role === 'owner' || hasPermission(user.permissions, resource, action);
  }

  private require(resource: PermissionResource, action: PermissionAction): void {
    if (!this.can(resource, action))
      throw new AppException(ErrorCode.FORBIDDEN_PERMISSION, `Missing permission ${resource}:${action}`);
  }

  /** Hides health data from staff without `dietClinical:view` (e.g. reception). */
  private visibleClient(client: DietClient): DietClient | Omit<DietClient, (typeof DIET_CLIENT_CLINICAL_FIELDS)[number]> {
    if (this.can('dietClinical', 'view')) return client;
    const copy: Record<string, unknown> = { ...client };
    for (const field of DIET_CLIENT_CLINICAL_FIELDS) delete copy[field];
    return copy as Omit<DietClient, (typeof DIET_CLIENT_CLINICAL_FIELDS)[number]>;
  }

  private visibleConsultation(item: DietConsultation) {
    if (this.can('dietClinical', 'view')) return item;
    const { notes: _notes, adherence: _adherence, ...rest } = item;
    return rest;
  }

  private staffName(): string {
    const user = this.tenant.getStore();
    return user.displayName?.trim() || user.email;
  }

  // ---------- clients ----------

  async listClients(query: ListDietClientsQueryDto) {
    const search = query.search?.trim().toLocaleLowerCase('tr-TR');
    const clients = (await this.repo.all<DietClient>(C.clients))
      .filter((c) => (query.status ? c.status === query.status : c.status !== 'archived'))
      .filter((c) => !query.dietitianId || c.dietitianId === query.dietitianId)
      .filter(
        (c) =>
          !search ||
          `${fullName(c)} ${c.email} ${c.phone}`.toLocaleLowerCase('tr-TR').includes(search),
      )
      .sort((a, b) => fullName(a).localeCompare(fullName(b), 'tr-TR'));
    return clients.map((c) => ({ ...this.visibleClient(c), goalProgressPct: goalProgressPct(c) }));
  }

  async getClient(id: string) {
    const client = await this.repo.get<DietClient>(C.clients, id);
    return { ...this.visibleClient(client), goalProgressPct: goalProgressPct(client) };
  }

  /** Everything the client detail screen needs in one round trip. */
  async clientOverview(id: string) {
    const client = await this.repo.get<DietClient>(C.clients, id);
    const clinical = this.can('dietClinical', 'view');
    const now = new Date().toISOString();
    const [measurements, plans, consultations, tasks, conversation] = await Promise.all([
      clinical ? this.repo.where<DietMeasurement>(C.measurements, 'clientId', id) : Promise.resolve([]),
      clinical ? this.repo.where<DietPlan>(C.plans, 'clientId', id) : Promise.resolve([]),
      this.can('dietSchedule', 'view')
        ? this.repo.where<DietConsultation>(C.consultations, 'clientId', id)
        : Promise.resolve([]),
      this.can('dietMessages', 'view') ? this.repo.where<DietTask>(C.tasks, 'clientId', id) : Promise.resolve([]),
      this.can('dietMessages', 'view')
        ? this.repo.readRaw<DietConversation>(C.conversations, id)
        : Promise.resolve(null),
    ]);
    const sortedConsultations = consultations.sort((a, b) => a.at.localeCompare(b.at));
    return {
      client: { ...this.visibleClient(client), goalProgressPct: goalProgressPct(client) },
      measurements: measurements.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30),
      activePlan: plans.find((p) => p.status === 'active') ?? null,
      nextConsultation:
        sortedConsultations.find((c) => c.status === 'scheduled' && c.at >= now) ?? null,
      recentConsultations: sortedConsultations
        .filter((c) => c.at < now)
        .reverse()
        .slice(0, 10)
        .map((c) => this.visibleConsultation(c)),
      openTasks: tasks.filter((t) => t.status === 'open').length,
      unreadMessages: conversation?.unreadForStaff ?? 0,
    };
  }

  async createClient(dto: CreateDietClientDto) {
    this.assertClinicalWrite(dto);
    const client = await this.repo.create<DietClient>(C.clients, {
      firstName: dto.firstName.trim(),
      lastName: dto.lastName.trim(),
      email: dto.email?.trim().toLowerCase() ?? '',
      phone: dto.phone?.trim() ?? '',
      birthDate: dto.birthDate ?? null,
      sex: dto.sex,
      heightCm: dto.heightCm,
      startWeightKg: dto.startWeightKg,
      targetWeightKg: dto.targetWeightKg,
      currentWeightKg: dto.startWeightKg,
      lastMeasuredAt: null,
      activity: dto.activity ?? 'light',
      program: dto.program ?? 'healthy',
      conditions: dto.conditions ?? [],
      allergies: dto.allergies ?? [],
      consentAt: dto.consentAt ?? null,
      status: dto.status ?? 'active',
      dietitianId: dto.dietitianId ?? this.repo.userId(),
      waistCm: dto.waistCm ?? null,
      hipCm: dto.hipCm ?? null,
      bodyFatPct: dto.bodyFatPct ?? null,
      waterTargetL: dto.waterTargetL ?? null,
      clinicalNotes: dto.clinicalNotes?.trim() ?? '',
    });
    return { ...this.visibleClient(client), goalProgressPct: goalProgressPct(client) };
  }

  async updateClient(id: string, dto: UpdateDietClientDto) {
    this.assertClinicalWrite(dto);
    const current = await this.repo.get<DietClient>(C.clients, id);
    const changes = omitUndefined({
      ...dto,
      firstName: dto.firstName?.trim(),
      lastName: dto.lastName?.trim(),
      email: dto.email?.trim().toLowerCase(),
      phone: dto.phone?.trim(),
      clinicalNotes: dto.clinicalNotes?.trim(),
    });
    const next: DietClient = { ...current, ...changes };
    // Before any measurement the current weight follows the start weight.
    if (dto.startWeightKg !== undefined && !current.lastMeasuredAt) next.currentWeightKg = dto.startWeightKg;
    const saved = await this.repo.save(C.clients, next);
    return { ...this.visibleClient(saved), goalProgressPct: goalProgressPct(saved) };
  }

  async deleteClient(id: string) {
    const client = await this.repo.get<DietClient>(C.clients, id);
    await this.repo.softDelete(C.clients, client);
    return { id, deleted: true };
  }

  private assertClinicalWrite(dto: Partial<CreateDietClientDto>) {
    const touchesClinical = DIET_CLIENT_CLINICAL_FIELDS.some((field) => dto[field] !== undefined);
    if (touchesClinical) this.require('dietClinical', 'update');
  }

  // ---------- measurements ----------

  async listMeasurements(clientId: string) {
    await this.repo.get<DietClient>(C.clients, clientId);
    const items = await this.repo.where<DietMeasurement>(C.measurements, 'clientId', clientId);
    return items.sort((a, b) => b.date.localeCompare(a.date));
  }

  async addMeasurement(clientId: string, dto: CreateDietMeasurementDto) {
    const client = await this.repo.get<DietClient>(C.clients, clientId);
    const measurement = await this.repo.create<DietMeasurement>(C.measurements, {
      clientId,
      date: dto.date ?? new Date().toISOString(),
      weightKg: dto.weightKg,
      waistCm: dto.waistCm ?? null,
      hipCm: dto.hipCm ?? null,
      bodyFatPct: dto.bodyFatPct ?? null,
      muscleMassKg: dto.muscleMassKg ?? null,
      visceralFatRating: dto.visceralFatRating ?? null,
      bodyWaterPct: dto.bodyWaterPct ?? null,
      metabolicAge: dto.metabolicAge ?? null,
      note: dto.note?.trim() ?? '',
      source: 'dietitian',
    });
    await this.syncLatestMeasurement(client);
    return measurement;
  }

  async deleteMeasurement(id: string) {
    const measurement = await this.repo.get<DietMeasurement>(C.measurements, id);
    await this.repo.softDelete(C.measurements, measurement);
    const client = await this.repo.find<DietClient>(C.clients, measurement.clientId);
    if (client) await this.syncLatestMeasurement(client);
    return { id, deleted: true };
  }

  /** Keeps the client's current weight / body values equal to the latest measurement. */
  private async syncLatestMeasurement(client: DietClient) {
    const items = await this.repo.where<DietMeasurement>(C.measurements, 'clientId', client.id);
    const latest = items.sort((a, b) => b.date.localeCompare(a.date))[0];
    const next: DietClient = latest
      ? {
          ...client,
          currentWeightKg: latest.weightKg,
          lastMeasuredAt: latest.date,
          waistCm: latest.waistCm ?? client.waistCm,
          hipCm: latest.hipCm ?? client.hipCm,
          bodyFatPct: latest.bodyFatPct ?? client.bodyFatPct,
        }
      : { ...client, currentWeightKg: client.startWeightKg, lastMeasuredAt: null };
    await this.repo.save(C.clients, next, { audit: false });
  }

  // ---------- consultations ----------

  async listConsultations(query: ListDietConsultationsQueryDto) {
    const source = query.clientId
      ? await this.repo.where<DietConsultation>(C.consultations, 'clientId', query.clientId)
      : query.from
        ? await this.repo.since<DietConsultation>(C.consultations, 'at', query.from)
        : await this.repo.all<DietConsultation>(C.consultations);
    const clients = await this.clientNames();
    return source
      .filter((c) => !query.from || c.at >= query.from)
      .filter((c) => !query.to || c.at <= query.to)
      .filter((c) => !query.dietitianId || c.dietitianId === query.dietitianId)
      .filter((c) => !query.status || c.status === query.status)
      .sort((a, b) => a.at.localeCompare(b.at))
      .map((c) => ({ ...this.visibleConsultation(c), clientName: clients.get(c.clientId) ?? '' }));
  }

  async createConsultation(dto: CreateDietConsultationDto) {
    await this.repo.get<DietClient>(C.clients, dto.clientId);
    if (dto.notes !== undefined || dto.adherence !== undefined) this.require('dietClinical', 'update');
    const item = await this.repo.create<DietConsultation>(C.consultations, {
      clientId: dto.clientId,
      dietitianId: dto.dietitianId ?? this.repo.userId(),
      at: dto.at,
      durationMin: dto.durationMin ?? 45,
      channel: dto.channel,
      status: dto.status ?? 'scheduled',
      adherence: dto.adherence ?? null,
      notes: dto.notes?.trim() ?? '',
      nextAction: dto.nextAction?.trim() ?? '',
    });
    return this.visibleConsultation(item);
  }

  async updateConsultation(id: string, dto: UpdateDietConsultationDto) {
    const current = await this.repo.get<DietConsultation>(C.consultations, id);
    if (dto.notes !== undefined || dto.adherence !== undefined) this.require('dietClinical', 'update');
    if (dto.clientId && dto.clientId !== current.clientId) await this.repo.get<DietClient>(C.clients, dto.clientId);
    const saved = await this.repo.save(C.consultations, {
      ...current,
      ...omitUndefined({ ...dto, notes: dto.notes?.trim(), nextAction: dto.nextAction?.trim() }),
    });
    return this.visibleConsultation(saved);
  }

  async deleteConsultation(id: string) {
    const item = await this.repo.get<DietConsultation>(C.consultations, id);
    await this.repo.softDelete(C.consultations, item);
    return { id, deleted: true };
  }

  // ---------- plans ----------

  async listPlans(query: ListDietPlansQueryDto) {
    const items = query.clientId
      ? await this.repo.where<DietPlan>(C.plans, 'clientId', query.clientId)
      : await this.repo.all<DietPlan>(C.plans);
    return items
      .filter((p) => !query.status || p.status === query.status)
      .sort((a, b) => b.startDate.localeCompare(a.startDate));
  }

  getPlan(id: string) {
    return this.repo.get<DietPlan>(C.plans, id);
  }

  async createPlan(dto: CreateDietPlanDto) {
    await this.repo.get<DietClient>(C.clients, dto.clientId);
    this.assertMacros(dto.proteinPct, dto.carbPct, dto.fatPct);
    const plan = await this.repo.create<DietPlan>(C.plans, {
      clientId: dto.clientId,
      title: dto.title.trim(),
      startDate: dto.startDate,
      endDate: dto.endDate,
      kcal: dto.kcal,
      proteinPct: dto.proteinPct,
      carbPct: dto.carbPct,
      fatPct: dto.fatPct,
      meals: (dto.meals ?? []).map((meal) => ({ ...meal })),
      status: dto.status ?? 'draft',
      notes: dto.notes?.trim() ?? '',
    });
    if (plan.status === 'active') await this.completeOtherActivePlans(plan);
    return plan;
  }

  async updatePlan(id: string, dto: UpdateDietPlanDto) {
    const current = await this.repo.get<DietPlan>(C.plans, id);
    if (dto.clientId && dto.clientId !== current.clientId) await this.repo.get<DietClient>(C.clients, dto.clientId);
    const next: DietPlan = {
      ...current,
      ...omitUndefined({
        ...dto,
        title: dto.title?.trim(),
        notes: dto.notes?.trim(),
        meals: dto.meals?.map((meal) => ({ ...meal })),
      }),
    };
    this.assertMacros(next.proteinPct, next.carbPct, next.fatPct);
    const saved = await this.repo.save(C.plans, next);
    if (saved.status === 'active' && current.status !== 'active') await this.completeOtherActivePlans(saved);
    return saved;
  }

  async deletePlan(id: string) {
    const plan = await this.repo.get<DietPlan>(C.plans, id);
    await this.repo.softDelete(C.plans, plan);
    return { id, deleted: true };
  }

  private assertMacros(protein: number, carb: number, fat: number) {
    const total = protein + carb + fat;
    if (total > 0 && Math.abs(total - 100) > 1)
      throw new AppException(ErrorCode.DIET_RECORD_INVALID, 'Protein, karbonhidrat ve yağ oranlarının toplamı %100 olmalı.');
  }

  /** A client has at most one active plan. */
  private async completeOtherActivePlans(active: DietPlan) {
    const plans = await this.repo.where<DietPlan>(C.plans, 'clientId', active.clientId);
    for (const plan of plans) {
      if (plan.id !== active.id && plan.status === 'active')
        await this.repo.save(C.plans, { ...plan, status: 'completed' as const });
    }
  }

  // ---------- conversations & messages ----------

  async listConversations() {
    const [conversations, clients] = await Promise.all([
      this.repo.all<DietConversation>(C.conversations),
      this.clientNames(),
    ]);
    return conversations
      .filter((c) => clients.has(c.clientId))
      .sort((a, b) => (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? ''))
      .map((c) => ({ ...c, clientName: clients.get(c.clientId) ?? '' }));
  }

  async listMessages(clientId: string, query: ListDietMessagesQueryDto) {
    await this.repo.get<DietClient>(C.clients, clientId);
    const limit = query.limit ?? 50;
    const items = (await this.repo.where<DietMessage>(C.messages, 'clientId', clientId))
      .filter((m) => !query.before || m.at < query.before)
      .sort((a, b) => a.at.localeCompare(b.at));
    return items.slice(Math.max(0, items.length - limit));
  }

  async sendMessage(clientId: string, dto: SendDietMessageDto) {
    await this.repo.get<DietClient>(C.clients, clientId);
    const body = dto.body?.trim() ?? '';
    const attachments = dto.attachments ?? [];
    if (!body && attachments.length === 0)
      throw new AppException(ErrorCode.DIET_RECORD_INVALID, 'Boş mesaj gönderilemez.');
    return this.postMessage(clientId, 'dietitian', this.staffName(), body, { attachments });
  }

  async markConversationRead(clientId: string) {
    await this.repo.get<DietClient>(C.clients, clientId);
    const conversation = await this.conversation(clientId);
    const saved = await this.repo.save(
      C.conversations,
      { ...conversation, staffReadAt: new Date().toISOString(), unreadForStaff: 0 },
      { audit: false },
    );
    return saved;
  }

  private async conversation(clientId: string): Promise<DietConversation> {
    const existing = await this.repo.find<DietConversation>(C.conversations, clientId);
    if (existing) return existing;
    return this.repo.create<DietConversation>(
      C.conversations,
      {
        clientId,
        lastMessageAt: null,
        lastMessagePreview: '',
        lastAuthor: null,
        staffReadAt: null,
        memberReadAt: null,
        unreadForStaff: 0,
        unreadForMember: 0,
      },
      { id: clientId, audit: false },
    );
  }

  private async postMessage(
    clientId: string,
    author: DietMessage['author'],
    authorName: string,
    body: string,
    extra: { attachments?: DietMessage['attachments']; taskId?: string; requestId?: string } = {},
  ): Promise<DietMessage> {
    const at = new Date().toISOString();
    const message = await this.repo.create<DietMessage>(
      C.messages,
      {
        clientId,
        author,
        authorName,
        body,
        at,
        attachments: extra.attachments ?? [],
        taskId: extra.taskId ?? null,
        requestId: extra.requestId ?? null,
      },
      { audit: false },
    );
    const conversation = await this.conversation(clientId);
    await this.repo.save(
      C.conversations,
      {
        ...conversation,
        lastMessageAt: at,
        lastMessagePreview: body ? body.slice(0, 140) : '📎 Ek dosya',
        lastAuthor: author,
        // Staff (and system notices raised by staff) count as unread for the member only.
        unreadForMember: conversation.unreadForMember + 1,
        staffReadAt: author === 'dietitian' ? at : conversation.staffReadAt,
        unreadForStaff: author === 'dietitian' ? 0 : conversation.unreadForStaff,
      },
      { audit: false },
    );
    return message;
  }

  // ---------- tasks ----------

  async listTasks(query: ListDietTasksQueryDto) {
    const items = query.clientId
      ? await this.repo.where<DietTask>(C.tasks, 'clientId', query.clientId)
      : await this.repo.all<DietTask>(C.tasks);
    const clients = await this.clientNames();
    return items
      .filter((t) => !query.status || t.status === query.status)
      .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'))
      .map((t) => ({ ...t, clientName: clients.get(t.clientId) ?? '' }));
  }

  async createTask(clientId: string, dto: CreateDietTaskDto) {
    await this.repo.get<DietClient>(C.clients, clientId);
    const task = await this.repo.create<DietTask>(C.tasks, {
      clientId,
      title: dto.title.trim(),
      description: dto.description?.trim() ?? '',
      category: dto.category,
      dueDate: dto.dueDate ?? null,
      status: 'open',
      completedAt: null,
      completionNote: '',
      attachments: [],
    });
    await this.postMessage(clientId, 'system', 'OdivonDiet', `Yeni görev: ${task.title}`, { taskId: task.id });
    return task;
  }

  async updateTask(id: string, dto: UpdateDietTaskDto) {
    const current = await this.repo.get<DietTask>(C.tasks, id);
    const next: DietTask = {
      ...current,
      ...omitUndefined({ ...dto, title: dto.title?.trim(), description: dto.description?.trim() }),
    };
    if (dto.status === 'done' && current.status !== 'done') next.completedAt = new Date().toISOString();
    if (dto.status === 'open') next.completedAt = null;
    return this.repo.save(C.tasks, next);
  }

  async deleteTask(id: string) {
    const task = await this.repo.get<DietTask>(C.tasks, id);
    await this.repo.softDelete(C.tasks, task);
    return { id, deleted: true };
  }

  // ---------- requests ----------

  async listRequests(query: ListDietRequestsQueryDto) {
    const items = query.clientId
      ? await this.repo.where<DietRequest>(C.requests, 'clientId', query.clientId)
      : await this.repo.all<DietRequest>(C.requests);
    const clients = await this.clientNames();
    return items
      .filter((r) => !query.status || r.status === query.status)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((r) => ({ ...r, clientName: clients.get(r.clientId) ?? '' }));
  }

  /** Staff records a request on the client's behalf (phone, front desk). Members use the portal. */
  async createRequest(dto: CreateDietRequestDto) {
    await this.repo.get<DietClient>(C.clients, dto.clientId);
    return this.repo.create<DietRequest>(C.requests, {
      clientId: dto.clientId,
      type: dto.type,
      subject: dto.subject.trim(),
      detail: dto.detail?.trim() ?? '',
      status: 'open',
      response: '',
      attachments: [],
      preferredDate: dto.preferredDate ?? null,
      preferredTime: dto.preferredTime ?? null,
      preferredChannel: dto.preferredChannel ?? null,
    });
  }

  async updateRequest(id: string, dto: UpdateDietRequestDto) {
    const current = await this.repo.get<DietRequest>(C.requests, id);
    const saved = await this.repo.save(C.requests, {
      ...current,
      ...omitUndefined({ status: dto.status, response: dto.response?.trim() }),
    });
    if (dto.status && dto.status !== current.status) {
      const note = saved.response ? ` · ${saved.response}` : '';
      await this.postMessage(
        saved.clientId,
        'system',
        'OdivonDiet',
        `"${saved.subject}" talebiniz: ${REQUEST_STATUS_LABELS[saved.status]}${note}`,
        { requestId: saved.id },
      );
    }
    return saved;
  }

  // ---------- dashboards ----------

  /** "Bugün" screen: daily agenda and what needs attention. */
  async dashboard() {
    const now = new Date();
    const today = istanbulDay(now);
    const monthStart = `${today.slice(0, 7)}-01`;
    const staleBefore = new Date(now.getTime() - STALE_MEASUREMENT_DAYS * DAY_MS).toISOString();
    const [clients, consultations, conversations, tasks, requests] = await Promise.all([
      this.repo.all<DietClient>(C.clients),
      this.repo.since<DietConsultation>(C.consultations, 'at', new Date(now.getTime() - 2 * DAY_MS).toISOString()),
      this.can('dietMessages', 'view') ? this.repo.all<DietConversation>(C.conversations) : Promise.resolve([]),
      this.can('dietMessages', 'view') ? this.repo.where<DietTask>(C.tasks, 'status', 'open') : Promise.resolve([]),
      this.can('dietMessages', 'view') ? this.repo.all<DietRequest>(C.requests) : Promise.resolve([]),
    ]);
    const names = new Map(clients.map((c) => [c.id, fullName(c)]));
    const active = clients.filter((c) => c.status === 'active');
    const progress = active.map(goalProgressPct).filter((p): p is number => p !== null);
    const todays = consultations
      .filter((c) => c.status !== 'cancelled' && istanbulDay(c.at) === today)
      .sort((a, b) => a.at.localeCompare(b.at))
      .map((c) => ({
        id: c.id,
        at: c.at,
        clientId: c.clientId,
        clientName: names.get(c.clientId) ?? '',
        channel: c.channel,
        status: c.status,
        dietitianId: c.dietitianId,
      }));
    const nowIso = now.toISOString();
    return {
      date: today,
      activeClients: active.length,
      newClientsThisMonth: clients.filter((c) => istanbulDay(c.createdAt) >= monthStart).length,
      todayConsultations: todays,
      nextConsultation: todays.find((c) => c.status === 'scheduled' && c.at >= nowIso) ?? null,
      avgGoalProgressPct: progress.length
        ? Math.round(progress.reduce((sum, p) => sum + p, 0) / progress.length)
        : null,
      unreadMessages: conversations
        .filter((c) => names.has(c.clientId))
        .reduce((sum, c) => sum + (c.unreadForStaff ?? 0), 0),
      openTasks: tasks.length,
      openRequests: requests.filter((r) => r.status === 'open' || r.status === 'in_progress').length,
      attentionClients: active
        .filter((c) => !c.lastMeasuredAt || c.lastMeasuredAt < staleBefore)
        .sort((a, b) => (a.lastMeasuredAt ?? '').localeCompare(b.lastMeasuredAt ?? ''))
        .slice(0, 10)
        .map((c) => ({ id: c.id, name: fullName(c), lastMeasuredAt: c.lastMeasuredAt, reason: 'no_recent_measurement' })),
    };
  }

  /** Clinic manager overview: workload per dietitian and growth. */
  async adminSummary() {
    const now = new Date();
    const last30 = new Date(now.getTime() - 30 * DAY_MS).toISOString();
    const last7 = new Date(now.getTime() - 7 * DAY_MS).toISOString();
    const [clients, consultations, staff] = await Promise.all([
      this.repo.all<DietClient>(C.clients),
      this.repo.since<DietConsultation>(C.consultations, 'at', last30),
      this.identity.listByCurrentTenant(),
    ]);
    const past = consultations.filter((c) => c.at <= now.toISOString());
    const months: string[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      months.push(d.toISOString().slice(0, 7));
    }
    const staffMembers = staff.filter((u) => u.status === 'active' && u.accountType !== 'gym_member');
    const byStatus = { active: 0, paused: 0, archived: 0 };
    for (const c of clients) byStatus[c.status] += 1;
    return {
      clientsByStatus: byStatus,
      newClientsByMonth: months.map((month) => ({
        month,
        count: clients.filter((c) => istanbulDay(c.createdAt).startsWith(month)).length,
      })),
      consultationsLast7Days: past.filter((c) => c.at >= last7 && c.status !== 'cancelled').length,
      consultationsLast30Days: past.filter((c) => c.status !== 'cancelled').length,
      completionRatePct: past.length
        ? Math.round((past.filter((c) => c.status === 'done').length / past.length) * 100)
        : null,
      staff: staffMembers.map((u) => ({
        uid: u.uid,
        name: u.displayName?.trim() || u.email,
        role: u.role,
        activeClients: clients.filter((c) => c.dietitianId === u.uid && c.status === 'active').length,
        consultationsLast30Days: past.filter((c) => c.dietitianId === u.uid && c.status !== 'cancelled').length,
      })),
    };
  }

  // ---------- devices & notification preferences ----------

  async registerDevice(dto: RegisterDietDeviceDto) {
    const id = deviceId(dto.token);
    const existing = await this.repo.readRaw<DietDevice>(C.devices, id);
    const now = new Date().toISOString();
    const userId = this.repo.userId();
    const device: DietDevice = {
      id,
      userId,
      token: dto.token,
      platform: dto.platform,
      appVersion: dto.appVersion ?? null,
      createdAt: existing?.createdAt ?? now,
      createdBy: existing?.createdBy ?? userId,
      updatedAt: now,
      updatedBy: userId,
      deletedAt: null,
    };
    await this.repo.writeRaw(C.devices, id, { ...device });
    return { id, platform: device.platform };
  }

  async unregisterDevice(token: string) {
    const id = deviceId(token);
    const existing = await this.repo.readRaw<DietDevice>(C.devices, id);
    if (existing && existing.userId === this.repo.userId()) await this.repo.deleteRaw(C.devices, id);
    return { id, deleted: Boolean(existing) };
  }

  async notificationPrefs(): Promise<DietNotificationPrefs> {
    const saved = await this.repo.readRaw<Partial<DietNotificationPrefs>>(C.notificationPrefs, this.repo.userId());
    return { ...DEFAULT_DIET_NOTIFICATION_PREFS, ...(saved ?? {}) };
  }

  async updateNotificationPrefs(dto: UpdateDietNotificationPrefsDto): Promise<DietNotificationPrefs> {
    const next = { ...(await this.notificationPrefs()), ...omitUndefined(dto) } as DietNotificationPrefs;
    await this.repo.writeRaw(C.notificationPrefs, this.repo.userId(), { ...next });
    return next;
  }

  // ---------- helpers ----------

  private async clientNames(): Promise<Map<string, string>> {
    const clients = await this.repo.all<DietClient>(C.clients);
    return new Map(clients.map((c) => [c.id, fullName(c)]));
  }
}

function deviceId(token: string): string {
  return createHash('sha256').update(token).digest('hex').slice(0, 40);
}
