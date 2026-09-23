import { Injectable } from '@nestjs/common';
import { AuditService } from '../../../../shared/audit/audit.service';
import { AuditAction } from '../../../../shared/audit/audit.types';
import { AppException } from '../../../../shared/errors/app.exception';
import { ErrorCode } from '../../../../shared/errors/error-codes';
import { FirebaseService } from '../../../../shared/firebase/firebase.service';
import { TENANT_COLLECTION, tenantCollectionPath } from '../../../../shared/firebase/firestore-path';
import { createBaseFields, isDeleted, omitUndefined, touchBaseFields } from '../../../../shared/firestore/base-document';
import { TenantContext } from '../../../../shared/tenancy/tenant.context';
import { LabDocument } from './lab-document.entity';

@Injectable()
export class LabDocumentsRepository {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly tenantContext: TenantContext,
    private readonly audit: AuditService,
  ) {}

  private collection() {
    return this.firebase.db.collection(tenantCollectionPath(this.tenantContext.getTenantId(), TENANT_COLLECTION.labDocuments));
  }

  async create(item: Omit<LabDocument, keyof ReturnType<typeof createBaseFields>>): Promise<LabDocument> {
    const ref = this.collection().doc();
    const document: LabDocument = { ...createBaseFields(ref.id, this.tenantContext.getUserId()), ...item };
    await ref.set(document);
    await this.audit.record({ action: AuditAction.LAB_DOCUMENT_CREATED, entity: 'labDocuments', entityId: document.id });
    return document;
  }

  async findById(id: string): Promise<LabDocument | null> {
    const snapshot = await this.collection().doc(id).get();
    if (!snapshot.exists) {
      return null;
    }
    const document = snapshot.data() as LabDocument;
    return isDeleted(document) ? null : document;
  }

  async getByIdOrThrow(id: string): Promise<LabDocument> {
    const document = await this.findById(id);
    if (!document) {
      throw new AppException(ErrorCode.LAB_DOCUMENT_NOT_FOUND, 'Lab dokümanı bulunamadı');
    }
    return document;
  }

  async collect(): Promise<LabDocument[]> {
    const snapshot = await this.collection().get();
    return snapshot.docs
      .map((doc) => doc.data() as LabDocument)
      .filter((document) => !isDeleted(document))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || left.id.localeCompare(right.id));
  }

  async update(id: string, patch: Partial<LabDocument>): Promise<LabDocument> {
    const current = await this.getByIdOrThrow(id);
    const updated: LabDocument = {
      ...current,
      ...omitUndefined(patch),
      ...touchBaseFields(this.tenantContext.getUserId()),
    };
    await this.collection().doc(id).set(updated);
    await this.audit.record({ action: AuditAction.LAB_DOCUMENT_UPDATED, entity: 'labDocuments', entityId: id });
    return updated;
  }

  async softDelete(id: string): Promise<void> {
    const current = await this.getByIdOrThrow(id);
    await this.collection()
      .doc(id)
      .set({ ...current, deletedAt: new Date().toISOString(), ...touchBaseFields(this.tenantContext.getUserId()) });
    await this.audit.record({ action: AuditAction.LAB_DOCUMENT_DELETED, entity: 'labDocuments', entityId: id });
  }
}
