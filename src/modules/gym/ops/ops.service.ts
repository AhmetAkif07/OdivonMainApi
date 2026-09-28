import { Injectable } from '@nestjs/common';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { TENANT_COLLECTION } from '../../../shared/firebase/firestore-path';
import { PaginatedResult } from '../../../shared/http/paginated.result';
import { BaseDocument, isDeleted } from '../../../shared/firestore/base-document';
import { AccessAgentsService } from '../access/access-agents.service';
import { PROTOCOL_TABLE, resolveProtocol } from '../access/access-rules';
import { GymMember } from '../members/member.entity';
import { MembersRepository } from '../members/members.repository';
import { isWithinCheckInWindow } from '../mobile/check-in-window';
import { PackagesRepository } from '../packages/packages.repository';
import { GymStore } from '../shared/gym-store';
import { GymListQueryDto, GymRecordDto } from '../shared/ops.dto';

type Doc = BaseDocument & Record<string, unknown>;

@Injectable()
export class GymOpsService {
  constructor(
    private readonly store: GymStore,
    private readonly members: MembersRepository,
    private readonly packages: PackagesRepository,
    private readonly accessAgents: AccessAgentsService,
  ) {}

  async listGates(query: GymListQueryDto) {
    const page = await this.store.page<Doc>(TENANT_COLLECTION.gymTurnstileGates, query);
    return new PaginatedResult(await this.accessAgents.decorateGates(page.items), page.limit, page.nextCursor);
  }

  async createGate(dto: GymRecordDto) {
    const protocol = resolveProtocol(dto.protocol);
    const gate = await this.store.create<Doc>(TENANT_COLLECTION.gymTurnstileGates, {
      ...dto,
      protocol,
      host: dto.host ?? null,
      port: dto.port ?? PROTOCOL_TABLE[protocol].defaultPort,
      agentId: null,
      lastSeenAt: null,
      lastError: null,
      status: dto.status ?? 'offline',
      direction: dto.direction ?? 'both',
    });
    return (await this.accessAgents.decorateGates([gate]))[0];
  }

  async updateGate(id: string, dto: GymRecordDto) {
    const gate = await this.store.update<Doc>(
      TENANT_COLLECTION.gymTurnstileGates,
      id,
      ErrorCode.GYM_GATE_NOT_FOUND,
      'Gate not found',
      dto.protocol ? { ...dto, protocol: resolveProtocol(dto.protocol) } : dto,
    );
    return (await this.accessAgents.decorateGates([gate]))[0];
  }

  removeGate(id: string) {
    return this.store.softDelete(TENANT_COLLECTION.gymTurnstileGates, id, ErrorCode.GYM_GATE_NOT_FOUND, 'Gate not found');
  }

  listAccessLogs(query: GymListQueryDto) {
    return this.store.page<Doc>(TENANT_COLLECTION.gymAccessLogs, query, (item) => {
      if (query.userId && item['userId'] !== query.userId) return false;
      return true;
    });
  }

  createAccessLog(dto: GymRecordDto) {
    return this.store.create(TENANT_COLLECTION.gymAccessLogs, {
      ...dto,
      timestamp: dto.timestamp || new Date().toISOString(),
      createdAt: new Date().toISOString(),
    });
  }

  queueDeviceCommand(dto: GymRecordDto) {
    return this.store.create(TENANT_COLLECTION.gymDeviceCommands, {
      ...dto,
      command: dto.command ?? 'PULL_LOGS_NOW',
      status: 'queued',
    });
  }

  async scan(dto: GymRecordDto) {
    const now = Date.now();
    let member = null as GymMember | null;
    let tokenId: string | null = null;

    if (dto.token) {
      const snapshot = await this.store.collection(TENANT_COLLECTION.gymQrTokens).doc(dto.token).get();
      const data = snapshot.exists ? (snapshot.data() as Doc) : null;
      if (!data || isDeleted(data)) {
        return this.denyScan(dto, 'Geçersiz QR kod.');
      }
      if (data['usedAt']) {
        return this.denyScan(dto, 'QR kod zaten kullanılmış.');
      }
      if (new Date(String(data['expiresAt'])).getTime() <= now) {
        return this.denyScan(dto, 'QR kodun süresi dolmuş.');
      }
      try {
        member = await this.members.getByIdOrThrow(String(data['userId'] ?? ''));
      } catch {
        member = null;
      }
      tokenId = dto.token;
    } else if (dto.uid || dto.userId) {
      try {
        member = await this.members.getByIdOrThrow(dto.uid || dto.userId || '');
      } catch {
        member = null;
      }
    }
    if (!member && dto.rfidCardNumber) {
      const all = await this.members.list({});
      member = all.find((item) => item.rfidCardNumber === dto.rfidCardNumber) ?? null;
    }
    let allowed = true;
    let status = 'granted';
    let message = 'Geçiş onaylandı.';
    if (!member) {
      allowed = false;
      status = 'denied';
      message = 'Üye bulunamadı.';
    } else if (member.membershipStatus === 'expired' || member.membershipStatus === 'cancelled') {
      allowed = false;
      status = 'denied';
      message = 'Üyelik süresi dolmuş veya iptal edilmiş.';
    } else if (member.membershipStatus === 'trial' && member.archivedAt) {
      allowed = false;
      status = 'denied';
      message = 'Üyelik arşivlenmiş.';
    } else if (member.membershipStatus === 'active' && member.membershipEndsAt) {
      if (new Date(member.membershipEndsAt).getTime() <= now) {
        allowed = false;
        status = 'denied';
        message = 'Paket süresi bitmiş.';
      }
    }
    if (allowed && member) {
      const pkg = member.packageLabel
        ? (await this.packages.list({})).find((item) => item.name === member?.packageLabel)
        : null;
      if (pkg && !isWithinCheckInWindow(pkg.checkInStartTime, pkg.checkInEndTime)) {
        allowed = false;
        status = 'denied';
        message = 'Giriş saati penceresi dışında.';
      }
    }
    const log = await this.store.create(TENANT_COLLECTION.gymAccessLogs, {
      userId: member?.uid ?? null,
      userName: member?.displayName ?? dto.userName ?? 'Bilinmeyen',
      userPhoto: member?.photoURL ?? null,
      direction: dto.direction ?? 'in',
      method: dto.method ?? 'qr',
      status,
      gateName: dto.gateName ?? 'Turnike',
      notes: message,
      timestamp: new Date().toISOString(),
    });
    if (allowed && tokenId) {
      await this.store.collection(TENANT_COLLECTION.gymQrTokens).doc(tokenId).update({
        usedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
    await this.store.create(TENANT_COLLECTION.gymDeviceCommands, {
      gateName: dto.gateName ?? 'Turnike',
      command: allowed ? 'open' : 'deny',
      status: 'queued',
    });
    return {
      allowed,
      status,
      message,
      userName: member?.displayName ?? 'Bilinmeyen',
      userPhoto: member?.photoURL ?? null,
      gateName: dto.gateName ?? 'Turnike',
      timestamp: new Date().toISOString(),
      log,
    };
  }

  private async denyScan(dto: GymRecordDto, message: string) {
    const log = await this.store.create(TENANT_COLLECTION.gymAccessLogs, {
      userId: null,
      userName: dto.userName ?? 'Bilinmeyen',
      userPhoto: null,
      direction: dto.direction ?? 'in',
      method: dto.method ?? 'qr',
      status: 'denied',
      gateName: dto.gateName ?? 'Turnike',
      notes: message,
      timestamp: new Date().toISOString(),
    });
    await this.store.create(TENANT_COLLECTION.gymDeviceCommands, {
      gateName: dto.gateName ?? 'Turnike',
      command: 'deny',
      status: 'queued',
    });
    return {
      allowed: false,
      status: 'denied',
      message,
      userName: dto.userName ?? 'Bilinmeyen',
      userPhoto: null,
      gateName: dto.gateName ?? 'Turnike',
      timestamp: new Date().toISOString(),
      log,
    };
  }

  listCampaigns(query: GymListQueryDto) {
    return this.store.page<Doc>(TENANT_COLLECTION.gymCampaigns, query);
  }

  createCampaign(dto: GymRecordDto) {
    return this.store.create(TENANT_COLLECTION.gymCampaigns, {
      ...dto,
      status: dto.status ?? 'draft',
      channels: dto.channels ?? ['in_app'],
      stats: { targetCount: 0, sentCount: 0, openedCount: 0, convertedCount: 0, revenueGenerated: 0 },
    });
  }

  updateCampaign(id: string, dto: GymRecordDto) {
    return this.store.update(
      TENANT_COLLECTION.gymCampaigns,
      id,
      ErrorCode.GYM_CAMPAIGN_NOT_FOUND,
      'Campaign not found',
      dto,
    );
  }

  removeCampaign(id: string) {
    return this.store.softDelete(
      TENANT_COLLECTION.gymCampaigns,
      id,
      ErrorCode.GYM_CAMPAIGN_NOT_FOUND,
      'Campaign not found',
    );
  }

  async broadcast(dto: GymRecordDto) {
    const members = await this.members.list({});
    const segment = dto.segment || dto.targetAudience || 'all_members';
    const now = Date.now();
    const filtered = members.filter((member) => {
      if (segment === 'trial_members') return member.membershipStatus === 'trial';
      if (segment === 'active_members') return member.membershipStatus === 'active';
      if (segment === 'inactive_members') {
        return member.membershipStatus === 'expired' || member.membershipStatus === 'cancelled';
      }
      if (segment === 'expiring_soon') {
        if (!member.membershipEndsAt) return false;
        const end = new Date(member.membershipEndsAt).getTime();
        return end >= now && end <= now + 7 * 86400000;
      }
      return true;
    });
    return this.store.create(TENANT_COLLECTION.gymCampaigns, {
      title: dto.title || 'Hızlı duyuru',
      description: dto.message || dto.description || '',
      type: 'event',
      discountType: 'gift_service',
      discountValue: 0,
      promoCode: dto.promoCode ?? '',
      validFrom: new Date().toISOString().slice(0, 10),
      validUntil: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
      status: 'active',
      targetAudience: segment,
      channels: dto.channels ?? ['in_app'],
      messageTemplate: { inAppTitle: dto.title, inAppBody: dto.message },
      stats: {
        targetCount: filtered.length,
        sentCount: filtered.length,
        openedCount: 0,
        convertedCount: 0,
        revenueGenerated: 0,
      },
    });
  }

  getSmsConfig() {
    return this.store.getSingleton(TENANT_COLLECTION.gymSmsConfig);
  }

  saveSmsConfig(dto: GymRecordDto) {
    return this.store.upsertSingleton(TENANT_COLLECTION.gymSmsConfig, {
      ...dto,
      provider: dto.provider ?? 'simulator',
      isActive: dto.isActive ?? true,
    });
  }

  async sendSms(dto: GymRecordDto) {
    const recipients = (dto.recipients ?? []).map((phone) => phone.replace(/\D/g, '')).filter((phone) => phone.length >= 10);
    const config = (await this.getSmsConfig()) as Doc | null;
    const provider = String(config?.['provider'] ?? 'simulator');
    const batchId = `SMS-${Date.now().toString().slice(-6)}`;
    return {
      success: true,
      totalRequested: dto.recipients?.length ?? 0,
      sentCount: recipients.length,
      failedCount: (dto.recipients?.length ?? 0) - recipients.length,
      provider,
      batchId,
      message: 'SMS simüle edildi (gerçek operatör yok).',
    };
  }

  getSaas() {
    return this.store.getSingleton(TENANT_COLLECTION.gymSaasSubscription);
  }

  async saveSaas(dto: GymRecordDto) {
    const members = await this.members.list({ archived: false });
    return this.store.upsertSingleton(TENANT_COLLECTION.gymSaasSubscription, {
      ...dto,
      planId: dto.planId ?? 'pro',
      billingCycle: dto.billingCycle ?? 'monthly',
      status: dto.status ?? 'trial',
      memberCount: members.length,
    });
  }
}
