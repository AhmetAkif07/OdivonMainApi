import { Injectable } from '@nestjs/common';
import { FirebaseService } from '../../../shared/firebase/firebase.service';
import { TENANT_COLLECTION } from '../../../shared/firebase/firestore-path';
import { TenantContext } from '../../../shared/tenancy/tenant.context';
import { gymCollection } from '../shared/gym-collection';
import { DEFAULT_MEMBER_MAIL_TEMPLATE, GymMailTemplate } from './gym-mail-template.entity';
import { UpdateGymMailTemplateDto } from './gym-mail-template.dto';

const DOC_ID = 'welcome_member';

@Injectable()
export class GymMailTemplateRepository {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly tenantContext: TenantContext,
  ) {}

  private doc() {
    return gymCollection(this.firebase, this.tenantContext, TENANT_COLLECTION.gymMailTemplate).doc(
      DOC_ID,
    );
  }

  async get(): Promise<GymMailTemplate> {
    const snap = await this.doc().get();
    if (!snap.exists) {
      return { ...DEFAULT_MEMBER_MAIL_TEMPLATE };
    }
    const data = snap.data() as Partial<GymMailTemplate>;
    return {
      ...DEFAULT_MEMBER_MAIL_TEMPLATE,
      ...data,
    };
  }

  async save(dto: UpdateGymMailTemplateDto): Promise<GymMailTemplate> {
    const userId = this.tenantContext.getUserId();
    const updated: GymMailTemplate = {
      enabled: dto.enabled,
      subject: dto.subject.trim(),
      heading: dto.heading.trim(),
      customMessage: dto.customMessage?.trim() || '',
      includeCredentials: dto.includeCredentials,
      includeQrCodeInfo: dto.includeQrCodeInfo,
      mobileAppUrl: dto.mobileAppUrl?.trim() || DEFAULT_MEMBER_MAIL_TEMPLATE.mobileAppUrl,
      updatedAt: new Date().toISOString(),
      updatedBy: userId,
    };
    await this.doc().set(updated);
    return updated;
  }
}
