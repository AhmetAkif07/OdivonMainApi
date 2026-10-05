import { Injectable } from '@nestjs/common';
import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { FirebaseService } from '../../../shared/firebase/firebase.service';
import { TENANT_COLLECTION, tenantCollectionPath } from '../../../shared/firebase/firestore-path';
import {
  createBaseFields,
  isDeleted,
  touchBaseFields,
} from '../../../shared/firestore/base-document';
import { paginateInMemory } from '../../../shared/http/paginate-memory';
import { TenantContext } from '../../../shared/tenancy/tenant.context';
import { CreateConsentFormDto } from './dto/create-consent-form.dto';
import { ListConsentFormsQueryDto } from './dto/list-consent-forms.query.dto';
import { UpdateConsentFormDto } from './dto/update-consent-form.dto';
import { ConsentForm } from './entities/consent-form.entity';

@Injectable()
export class ConsentFormsRepository {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly tenantContext: TenantContext,
  ) {}

  private collection() {
    return this.firebase.db.collection(
      tenantCollectionPath(this.tenantContext.getTenantId(), TENANT_COLLECTION.consentForms),
    );
  }

  async list(query: ListConsentFormsQueryDto) {
    const snapshot = await this.collection().get();
    let items = snapshot.docs
      .map((doc) => doc.data() as ConsentForm)
      .filter((item) => !isDeleted(item));

    if (query.patientId) {
      items = items.filter((i) => i.patientId === query.patientId);
    }
    if (query.customerId) {
      items = items.filter((i) => i.customerId === query.customerId);
    }
    if (query.type) {
      items = items.filter((i) => i.type === query.type);
    }
    if (query.status) {
      items = items.filter((i) => i.status === query.status);
    }
    if (query.q) {
      const q = query.q.trim().toLowerCase();
      items = items.filter(
        (i) =>
          i.patientName.toLowerCase().includes(q) ||
          i.customerName.toLowerCase().includes(q) ||
          i.title.toLowerCase().includes(q) ||
          (i.procedureName && i.procedureName.toLowerCase().includes(q)),
      );
    }

    items.sort((a, b) => new Date(b.signedAt).getTime() - new Date(a.signedAt).getTime());
    return paginateInMemory(items, query.limit, query.cursor);
  }

  async findById(id: string): Promise<ConsentForm | null> {
    const snapshot = await this.collection().doc(id).get();
    if (!snapshot.exists) return null;
    const form = snapshot.data() as ConsentForm;
    return isDeleted(form) ? null : form;
  }

  async getByIdOrThrow(id: string): Promise<ConsentForm> {
    const form = await this.findById(id);
    if (!form) {
      throw new AppException(ErrorCode.CONSENT_FORM_NOT_FOUND, 'Onam formu bulunamadı');
    }
    return form;
  }

  async create(dto: CreateConsentFormDto): Promise<ConsentForm> {
    const ref = this.collection().doc();
    const now = new Date().toISOString();
    const form: ConsentForm = {
      ...createBaseFields(ref.id, this.tenantContext.getUserId()),
      type: dto.type,
      title: dto.title,
      customerId: dto.customerId,
      customerName: dto.customerName,
      customerPhone: dto.customerPhone,
      customerNationalId: dto.customerNationalId ?? null,
      patientId: dto.patientId,
      patientName: dto.patientName,
      patientChipNumber: dto.patientChipNumber ?? null,
      procedureName: dto.procedureName ?? null,
      riskAcknowledgment: dto.riskAcknowledgment,
      anesthesiaApproval: dto.anesthesiaApproval,
      emergencyInterventionApproval: dto.emergencyInterventionApproval,
      doctorNotes: dto.doctorNotes ?? null,
      signatureDataUrl: dto.signatureDataUrl,
      signedAt: dto.signedAt ?? now,
      status: 'signed',
    };

    await ref.set(form);
    return form;
  }

  async update(id: string, dto: UpdateConsentFormDto): Promise<ConsentForm> {
    const current = await this.getByIdOrThrow(id);
    const updated: ConsentForm = {
      ...current,
      ...touchBaseFields(this.tenantContext.getUserId()),
      status: dto.status ?? current.status,
      doctorNotes: dto.doctorNotes !== undefined ? dto.doctorNotes : current.doctorNotes,
    };

    await this.collection().doc(id).set(updated);
    return updated;
  }

  async softDelete(id: string): Promise<void> {
    await this.getByIdOrThrow(id);
    await this.collection()
      .doc(id)
      .update({
        deletedAt: new Date().toISOString(),
        ...touchBaseFields(this.tenantContext.getUserId()),
      });
  }
}
