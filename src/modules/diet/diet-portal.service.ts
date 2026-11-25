import { randomBytes } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { AppException } from '../../shared/errors/app.exception';
import { ErrorCode } from '../../shared/errors/error-codes';
import { FirebaseService } from '../../shared/firebase/firebase.service';
import { MailService } from '../../shared/mail/mail.service';
import { TenantContext } from '../../shared/tenancy/tenant.context';
import { UserProfile } from '../identity/entities/user-profile.entity';
import { IdentityRepository } from '../identity/identity.repository';
import { TenantService } from '../tenant/tenant.service';
import { DIET_COLLECTIONS as C } from './diet.constants';
import {
  CompleteDietPortalTaskDto,
  CreateDietMeasurementDto,
  CreateDietPortalRequestDto,
  ListDietMessagesQueryDto,
  SendDietMessageDto,
} from './diet.dto';
import { DietRepository } from './diet.repository';
import { DietService, fullName, goalProgressPct } from './diet.service';
import {
  DietClient,
  DietClientPortal,
  DietConsultation,
  DietConversation,
  DietMeasurement,
  DietMessage,
  DietPlan,
  DietRequest,
  DietTask,
} from './diet.types';

/** Fields a member never sees on their own client record (dietitian's private notes). */
const MEMBER_HIDDEN_CLIENT_FIELDS = ['clinicalNotes', 'portal', 'createdBy', 'updatedBy', 'deletedAt'] as const;

function portalForbidden(message: string): AppException {
  return new AppException(ErrorCode.DIET_PORTAL_FORBIDDEN, message);
}

function authErrorCode(error: unknown): string | undefined {
  const info = error as { code?: string; errorInfo?: { code?: string } };
  return info?.errorInfo?.code ?? info?.code;
}

/**
 * OdivonDiet client portal.
 *
 * Staff side: the dietitian invites a client (who must have an e-mail address). That creates a
 * Firebase user with a random password, a `users/{uid}` profile with `accountType: 'diet_member'`
 * and the client id, and custom claims `{ role: 'member', clientId }`; the client receives a
 * set-password link. Disabling the portal disables the Firebase user and the profile.
 *
 * Member side: every `/diet/portal/*` call is scoped to the client id stored on the member's
 * profile (never one from the request). Members never see consultation notes, draft plans or the
 * dietitian's clinical notes.
 */
@Injectable()
export class DietPortalService {
  private readonly logger = new Logger(DietPortalService.name);

  constructor(
    private readonly repo: DietRepository,
    private readonly diet: DietService,
    private readonly tenant: TenantContext,
    private readonly firebase: FirebaseService,
    private readonly users: IdentityRepository,
    private readonly tenants: TenantService,
    private readonly mail: MailService,
  ) {}

  // ---------- staff: invite / disable ----------

  async invite(clientId: string) {
    const current = this.tenant.getStore();
    const client = await this.repo.get<DietClient>(C.clients, clientId);
    const email = client.email?.trim().toLowerCase();
    if (!email) {
      throw new AppException(ErrorCode.DIET_RECORD_INVALID, 'Portal daveti için danışanın e-posta adresi gerekli.');
    }
    if (client.status === 'archived') {
      throw new AppException(ErrorCode.DIET_RECORD_INVALID, 'Arşivlenmiş danışana portal daveti gönderilemez.');
    }

    const now = new Date().toISOString();
    const displayName = fullName(client);
    let uid = client.portal?.uid ?? null;

    if (uid) {
      // Re-invite: the account exists already (maybe disabled, maybe with another address).
      const profile = await this.users.findByUid(uid);
      if (!profile || profile.accountType !== 'diet_member' || profile.dietClientId !== client.id) uid = null;
    }

    if (uid) {
      await this.firebase.auth.updateUser(uid, { email, displayName, disabled: false, emailVerified: true });
      await this.users.updateProfile(uid, { email, displayName, status: 'active', updatedAt: now });
    } else {
      uid = await this.createMemberAccount(client, email, displayName, now, current.tenantId);
    }

    const setPasswordLink = await this.firebase.auth.generatePasswordResetLink(email);
    const portal: DietClientPortal = {
      status: client.portal?.status === 'active' ? 'active' : 'invited',
      uid,
      email,
      invitedAt: now,
      activatedAt: client.portal?.activatedAt ?? null,
      disabledAt: null,
    };
    await this.repo.save(C.clients, { ...client, portal });

    const emailSent = await this.sendInvite(email, displayName, client.dietitianId, setPasswordLink);
    return { clientId: client.id, portal, emailSent, setPasswordLink };
  }

  async disable(clientId: string) {
    const client = await this.repo.get<DietClient>(C.clients, clientId);
    if (!client.portal?.uid) {
      throw new AppException(ErrorCode.DIET_RECORD_INVALID, 'Bu danışanın portal hesabı yok.');
    }
    const now = new Date().toISOString();
    const uid = client.portal.uid;
    await this.firebase.auth.updateUser(uid, { disabled: true }).catch((err) => this.logger.error(err));
    await this.firebase.auth.revokeRefreshTokens(uid).catch((err) => this.logger.error(err));
    await this.users.updateProfile(uid, { status: 'inactive', updatedAt: now }).catch((err) => this.logger.error(err));
    const portal: DietClientPortal = { ...client.portal, status: 'disabled', disabledAt: now };
    await this.repo.save(C.clients, { ...client, portal });
    return { clientId: client.id, portal };
  }

  private async createMemberAccount(
    client: DietClient,
    email: string,
    displayName: string,
    now: string,
    tenantId: string,
  ): Promise<string> {
    let uid: string | undefined;
    let profileCreated = false;
    try {
      // The password is never shown to anyone: the client sets their own through the reset link.
      // The clinic invites a known address and only its owner can use that link, so it counts as verified.
      const record = await this.firebase.auth.createUser({
        email,
        password: randomBytes(24).toString('base64url'),
        displayName,
        emailVerified: true,
      });
      uid = record.uid;
      const profile: UserProfile = {
        uid,
        tenantId,
        role: 'user',
        accountType: 'diet_member',
        dietClientId: client.id,
        modules: ['diet'],
        email,
        displayName,
        phone: client.phone || null,
        roleIds: [],
        status: 'active',
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      };
      await this.users.createProfile(profile);
      profileCreated = true;
      await this.firebase.auth.setCustomUserClaims(uid, {
        tenantId,
        role: 'member',
        accountType: 'diet_member',
        clientId: client.id,
        modules: ['diet'],
      });
      return uid;
    } catch (error) {
      if (uid) {
        if (profileCreated) await this.users.hardDelete(uid).catch((err) => this.logger.error(err));
        await this.firebase.auth.deleteUser(uid).catch((err) => this.logger.error(err));
      }
      if (authErrorCode(error) === 'auth/email-already-exists') {
        throw new AppException(
          ErrorCode.DIET_PORTAL_CONFLICT,
          'Bu e-posta adresiyle kayıtlı başka bir Odivon hesabı var. Danışan için farklı bir e-posta girin.',
        );
      }
      throw error;
    }
  }

  private async sendInvite(to: string, displayName: string, dietitianId: string, setPasswordLink: string) {
    try {
      const [tenant, dietitian] = await Promise.all([
        this.tenants.getById(this.tenant.getTenantId()),
        dietitianId ? this.users.findByUid(dietitianId) : Promise.resolve(null),
      ]);
      return await this.mail.sendDietPortalInvite({
        to,
        displayName,
        tenantName: tenant.name,
        dietitianName: dietitian?.displayName ?? null,
        setPasswordLink,
      });
    } catch (error) {
      this.logger.error(error);
      return false;
    }
  }

  // ---------- member side ----------

  /** The signed-in member's client record; rejects staff accounts and disabled portals. */
  async memberClient(): Promise<DietClient> {
    const store = this.tenant.getStore();
    if (store.accountType !== 'diet_member' || !store.dietClientId) {
      throw portalForbidden('Bu bölüm yalnızca danışan hesaplarına açıktır.');
    }
    const client = await this.repo.find<DietClient>(C.clients, store.dietClientId);
    if (!client || client.portal?.uid !== store.userId || client.portal.status === 'disabled') {
      throw portalForbidden('Danışan portalı erişiminiz kapalı. Diyetisyeninizle iletişime geçin.');
    }
    return client;
  }

  async me() {
    let client = await this.memberClient();
    if (client.portal && client.portal.status !== 'active') {
      client = await this.repo.save(
        C.clients,
        { ...client, portal: { ...client.portal, status: 'active', activatedAt: new Date().toISOString() } },
        { audit: false },
      );
    }
    const tenantId = this.tenant.getTenantId();
    const [tenant, dietitian, conversation, tasks, plans, consultations] = await Promise.all([
      this.tenants.getById(tenantId).catch(() => null),
      client.dietitianId ? this.users.findByUid(client.dietitianId) : Promise.resolve(null),
      this.repo.find<DietConversation>(C.conversations, client.id),
      this.repo.where<DietTask>(C.tasks, 'clientId', client.id),
      this.repo.where<DietPlan>(C.plans, 'clientId', client.id),
      this.repo.where<DietConsultation>(C.consultations, 'clientId', client.id),
    ]);
    const now = new Date().toISOString();
    const next = consultations
      .filter((c) => c.status === 'scheduled' && c.at >= now)
      .sort((a, b) => a.at.localeCompare(b.at))[0];
    return {
      client: { ...this.memberView(client), goalProgressPct: goalProgressPct(client) },
      clinic: { name: tenant?.name ?? '' },
      dietitian: dietitian
        ? { id: dietitian.uid, name: dietitian.displayName?.trim() || dietitian.email }
        : null,
      activePlan: plans.find((p) => p.status === 'active') ?? null,
      nextConsultation: next ? this.memberConsultation(next) : null,
      openTasks: tasks.filter((t) => t.status === 'open').length,
      unreadMessages: conversation?.unreadForMember ?? 0,
      conversation: {
        memberReadAt: conversation?.memberReadAt ?? null,
        staffReadAt: conversation?.staffReadAt ?? null,
      },
    };
  }

  async plans() {
    const client = await this.memberClient();
    const plans = await this.repo.where<DietPlan>(C.plans, 'clientId', client.id);
    return plans
      .filter((p) => p.status !== 'draft')
      .sort((a, b) => b.startDate.localeCompare(a.startDate));
  }

  async measurements() {
    const client = await this.memberClient();
    const items = await this.repo.where<DietMeasurement>(C.measurements, 'clientId', client.id);
    return items.sort((a, b) => b.date.localeCompare(a.date));
  }

  /** The member logs their own weigh-in at home (marked `source: 'member'`). */
  async addMeasurement(dto: CreateDietMeasurementDto) {
    const client = await this.memberClient();
    const measurement = await this.repo.create<DietMeasurement>(C.measurements, {
      clientId: client.id,
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
      source: 'member',
    });
    await this.diet.syncLatestMeasurement(client);
    return measurement;
  }

  async consultations() {
    const client = await this.memberClient();
    const items = await this.repo.where<DietConsultation>(C.consultations, 'clientId', client.id);
    return items.sort((a, b) => b.at.localeCompare(a.at)).map((c) => this.memberConsultation(c));
  }

  async messages(query: ListDietMessagesQueryDto) {
    const client = await this.memberClient();
    const limit = query.limit ?? 50;
    const items = (await this.repo.where<DietMessage>(C.messages, 'clientId', client.id))
      .filter((m) => !query.before || m.at < query.before)
      .sort((a, b) => a.at.localeCompare(b.at));
    return items.slice(Math.max(0, items.length - limit));
  }

  async sendMessage(dto: SendDietMessageDto) {
    const client = await this.memberClient();
    const body = dto.body?.trim() ?? '';
    const attachments = dto.attachments ?? [];
    if (!body && attachments.length === 0)
      throw new AppException(ErrorCode.DIET_RECORD_INVALID, 'Boş mesaj gönderilemez.');
    return this.diet.postMessage(client.id, 'member', fullName(client), body, { attachments });
  }

  async markRead() {
    const client = await this.memberClient();
    const conversation = await this.diet.conversation(client.id);
    const saved = await this.repo.save(
      C.conversations,
      { ...conversation, memberReadAt: new Date().toISOString(), unreadForMember: 0 },
      { audit: false },
    );
    return { unreadForMember: saved.unreadForMember, memberReadAt: saved.memberReadAt };
  }

  async tasks() {
    const client = await this.memberClient();
    const items = await this.repo.where<DietTask>(C.tasks, 'clientId', client.id);
    return items.sort((a, b) => {
      if (a.status !== b.status) return a.status === 'open' ? -1 : 1;
      return (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999');
    });
  }

  async completeTask(taskId: string, dto: CompleteDietPortalTaskDto) {
    const client = await this.memberClient();
    const task = await this.repo.find<DietTask>(C.tasks, taskId);
    if (!task || task.clientId !== client.id) {
      throw new AppException(ErrorCode.DIET_RECORD_NOT_FOUND, 'Görev bulunamadı.');
    }
    if (task.status === 'done') return task;
    const saved = await this.repo.save(C.tasks, {
      ...task,
      status: 'done' as const,
      completedAt: new Date().toISOString(),
      completionNote: dto.note?.trim() ?? '',
      attachments: [...task.attachments, ...(dto.attachments ?? [])],
    });
    const note = saved.completionNote ? ` · ${saved.completionNote}` : '';
    await this.diet.postMessage(client.id, 'member', fullName(client), `✅ Görev tamamlandı: ${saved.title}${note}`, {
      taskId: saved.id,
      attachments: dto.attachments ?? [],
    });
    return saved;
  }

  async requests() {
    const client = await this.memberClient();
    const items = await this.repo.where<DietRequest>(C.requests, 'clientId', client.id);
    return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async createRequest(dto: CreateDietPortalRequestDto) {
    const client = await this.memberClient();
    const request = await this.repo.create<DietRequest>(C.requests, {
      clientId: client.id,
      type: dto.type,
      subject: dto.subject.trim(),
      detail: dto.detail?.trim() ?? '',
      status: 'open',
      response: '',
      attachments: dto.attachments ?? [],
      preferredDate: dto.preferredDate ?? null,
      preferredTime: dto.preferredTime ?? null,
      preferredChannel: dto.preferredChannel ?? null,
    });
    await this.diet.postMessage(client.id, 'member', fullName(client), `📝 Yeni talep: ${request.subject}`, {
      requestId: request.id,
    });
    return request;
  }

  /** KVKK explicit consent given by the member in the portal. */
  async giveConsent() {
    const client = await this.memberClient();
    if (client.consentAt) return { consentAt: client.consentAt };
    const saved = await this.repo.save(C.clients, { ...client, consentAt: new Date().toISOString() });
    return { consentAt: saved.consentAt };
  }

  private memberView(client: DietClient) {
    const copy: Record<string, unknown> = { ...client };
    for (const field of MEMBER_HIDDEN_CLIENT_FIELDS) delete copy[field];
    return copy as Omit<DietClient, (typeof MEMBER_HIDDEN_CLIENT_FIELDS)[number]>;
  }

  private memberConsultation(item: DietConsultation) {
    const { notes: _notes, adherence: _adherence, createdBy: _c, updatedBy: _u, ...rest } = item;
    return rest;
  }
}
