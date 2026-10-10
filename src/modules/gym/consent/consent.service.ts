import { Injectable } from '@nestjs/common';
import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { BaseDocument } from '../../../shared/firestore/base-document';
import { MembersRepository } from '../members/members.repository';
import { GymStore } from '../shared/gym-store';
import {
  ConsentType,
  RecordMemberConsentsDto,
  RevokeConsentDto,
  UpsertConsentTextDto,
} from './consent.dto';
import { ConsentTextDefinition, DEFAULT_CONSENT_TEXTS } from './consent.default-texts';

export interface GymConsentLogDocument extends BaseDocument {
  tenantId: string;
  memberId: string;
  memberFullName: string;
  consentType: ConsentType;
  version: string;
  status: 'granted' | 'revoked';
  channel: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  authorizedByStaffId: string;
  consentedAt: string;
  notes?: string | null;
}

export interface GymConsentTextDocument extends BaseDocument, ConsentTextDefinition {
  tenantId: string;
  publishedAt: string;
}

export const GYM_CONSENT_COLLECTIONS = {
  texts: 'gymConsentTexts',
  logs: 'gymConsentLogs',
} as const;

@Injectable()
export class GymConsentService {
  constructor(
    private readonly store: GymStore,
    private readonly members: MembersRepository,
  ) {}

  /**
   * Retrieves active consent texts, falling back to default compliant templates
   * for any consent type that the tenant has not yet customized.
   */
  async getActiveTexts(): Promise<ConsentTextDefinition[]> {
    const customTexts = await this.store.list<GymConsentTextDocument>(GYM_CONSENT_COLLECTIONS.texts);
    const customMap = new Map(customTexts.map((item) => [item.type, item]));

    return DEFAULT_CONSENT_TEXTS.map((defaultItem) => {
      const custom = customMap.get(defaultItem.type);
      if (custom && custom.isActive) {
        return {
          type: custom.type,
          title: custom.title,
          version: custom.version,
          isRequired: custom.isRequired,
          isActive: custom.isActive,
          contentHtml: custom.contentHtml,
        };
      }
      return defaultItem;
    });
  }

  /**
   * Upserts or updates a consent text version for the tenant.
   */
  async upsertText(dto: UpsertConsentTextDto): Promise<GymConsentTextDocument> {
    const now = new Date().toISOString();
    const docRef = this.store.collection(GYM_CONSENT_COLLECTIONS.texts).doc(dto.type);
    const existing = await docRef.get();

    const record: GymConsentTextDocument = {
      id: dto.type,
      tenantId: this.store.tenantId(),
      type: dto.type,
      title: dto.title,
      version: dto.version || '1.0',
      contentHtml: dto.contentHtml,
      isRequired: dto.isRequired ?? false,
      isActive: dto.isActive ?? true,
      publishedAt: now,
      createdAt: existing.exists ? (existing.data()?.createdAt ?? now) : now,
      updatedAt: now,
      createdBy: existing.exists ? (existing.data()?.createdBy ?? this.store.userId()) : this.store.userId(),
      updatedBy: this.store.userId(),
      deletedAt: null,
    };

    await docRef.set(record);
    return record;
  }

  /**
   * Records member consent audit log and synchronizes status flags on the member entity.
   */
  async recordConsents(dto: RecordMemberConsentsDto) {
    const now = new Date().toISOString();
    const staffId = this.store.userId();
    const member = await this.members.getByIdOrThrow(dto.memberId);

    const logsCreated: GymConsentLogDocument[] = [];
    let updatedKvkk = member.kvkkConsent ?? null;
    let updatedKvkkAt = member.kvkkConsentAt ?? null;
    let updatedCommercial = member.commercialConsent ?? null;
    let updatedCommercialAt = member.commercialConsentAt ?? null;
    let updatedHealth = member.healthConsent ?? null;
    let updatedHealthAt = member.healthConsentAt ?? null;

    for (const item of dto.consents) {
      const logRecord: Omit<GymConsentLogDocument, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'> = {
        tenantId: this.store.tenantId(),
        memberId: dto.memberId,
        memberFullName: dto.memberFullName || member.displayName,
        consentType: item.consentType,
        version: item.version,
        status: item.granted ? 'granted' : 'revoked',
        channel: dto.channel || 'ADMIN_PANEL',
        ipAddress: dto.ipAddress || null,
        userAgent: dto.userAgent || null,
        authorizedByStaffId: staffId,
        consentedAt: now,
        notes: item.notes || null,
        deletedAt: null,
      };

      const createdLog = await this.store.create<GymConsentLogDocument>(
        GYM_CONSENT_COLLECTIONS.logs,
        logRecord,
      );
      logsCreated.push(createdLog);

      if (item.consentType === 'kvkk_general') {
        updatedKvkk = item.granted;
        updatedKvkkAt = item.granted ? now : null;
      } else if (item.consentType === 'commercial_communication') {
        updatedCommercial = item.granted;
        updatedCommercialAt = item.granted ? now : null;
      } else if (item.consentType === 'health_biometric') {
        updatedHealth = item.granted;
        updatedHealthAt = item.granted ? now : null;
      }
    }

    // Update member record with latest flags
    await this.members.update(dto.memberId, {
      kvkkConsent: updatedKvkk,
      kvkkConsentAt: updatedKvkkAt,
      commercialConsent: updatedCommercial,
      commercialConsentAt: updatedCommercialAt,
      healthConsent: updatedHealth,
      healthConsentAt: updatedHealthAt,
    } as any);

    return {
      success: true,
      recordedCount: logsCreated.length,
      logs: logsCreated,
    };
  }

  /**
   * Retrieves full consent audit log history and current active status for a given member.
   */
  async getMemberConsents(memberId: string) {
    const member = await this.members.getByIdOrThrow(memberId);
    const allLogs = await this.store.list<GymConsentLogDocument>(GYM_CONSENT_COLLECTIONS.logs);
    const memberLogs = allLogs
      .filter((log) => log.memberId === memberId)
      .sort((a, b) => (b.consentedAt ?? '').localeCompare(a.consentedAt ?? ''));

    // Compute latest status per type
    const latestByType: Record<ConsentType, { status: 'granted' | 'revoked' | 'none'; version?: string; consentedAt?: string }> = {
      kvkk_general: {
        status: member.kvkkConsent ? 'granted' : member.kvkkConsent === false ? 'revoked' : 'none',
        consentedAt: member.kvkkConsentAt ?? undefined,
      },
      commercial_communication: {
        status: member.commercialConsent ? 'granted' : member.commercialConsent === false ? 'revoked' : 'none',
        consentedAt: member.commercialConsentAt ?? undefined,
      },
      health_biometric: {
        status: member.healthConsent ? 'granted' : member.healthConsent === false ? 'revoked' : 'none',
        consentedAt: member.healthConsentAt ?? undefined,
      },
      camera_cctv: { status: 'none' },
      cookie_policy: { status: 'none' },
    };

    for (const log of memberLogs) {
      if (latestByType[log.consentType]?.status === 'none') {
        latestByType[log.consentType] = {
          status: log.status,
          version: log.version,
          consentedAt: log.consentedAt,
        };
      }
    }

    return {
      memberId,
      displayName: member.displayName,
      summary: latestByType,
      history: memberLogs,
    };
  }

  /**
   * Revokes a specific consent for a member.
   */
  async revokeConsent(dto: RevokeConsentDto) {
    const member = await this.members.getByIdOrThrow(dto.memberId);
    const now = new Date().toISOString();
    const staffId = this.store.userId();

    const logRecord = {
      tenantId: this.store.tenantId(),
      memberId: dto.memberId,
      memberFullName: member.displayName,
      consentType: dto.consentType,
      version: 'revoked',
      status: 'revoked' as const,
      channel: dto.channel || 'ADMIN_PANEL',
      authorizedByStaffId: staffId,
      consentedAt: now,
      notes: dto.reason || 'Rıza kullanıcı/yetkili talebiyle geri çekildi',
      deletedAt: null,
    };

    const createdLog = await this.store.create<GymConsentLogDocument>(
      GYM_CONSENT_COLLECTIONS.logs,
      logRecord,
    );

    const updatePatch: any = {};
    if (dto.consentType === 'kvkk_general') {
      updatePatch.kvkkConsent = false;
      updatePatch.kvkkConsentAt = null;
    } else if (dto.consentType === 'commercial_communication') {
      updatePatch.commercialConsent = false;
      updatePatch.commercialConsentAt = null;
    } else if (dto.consentType === 'health_biometric') {
      updatePatch.healthConsent = false;
      updatePatch.healthConsentAt = null;
    }

    await this.members.update(dto.memberId, updatePatch);

    return {
      success: true,
      revoked: dto.consentType,
      log: createdLog,
    };
  }
}
