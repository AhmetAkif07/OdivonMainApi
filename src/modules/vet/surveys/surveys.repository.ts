import { createHash } from 'crypto';
import { Injectable } from '@nestjs/common';
import { AuditService } from '../../../shared/audit/audit.service';
import { AuditAction } from '../../../shared/audit/audit.types';
import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { FirebaseService } from '../../../shared/firebase/firebase.service';
import { ROOT_COLLECTION, TENANT_COLLECTION, tenantCollectionPath } from '../../../shared/firebase/firestore-path';
import { BaseDocument, createBaseFields, isDeleted, touchBaseFields } from '../../../shared/firestore/base-document';
import { TenantContext } from '../../../shared/tenancy/tenant.context';
import { SurveyInvite, SurveyTemplate, SurveyTokenLookup } from './survey.entity';

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Tenant-scoped reads and writes for survey templates and invites, plus the root token lookup. */
@Injectable()
export class SurveysRepository {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly tenantContext: TenantContext,
    private readonly audit: AuditService,
  ) {}

  private col(collection: string, tenantId = this.tenantContext.getTenantId()) {
    return this.firebase.db.collection(tenantCollectionPath(tenantId, collection));
  }

  private lookupRef(token: string) {
    return this.firebase.db.collection(ROOT_COLLECTION.vetSurveyTokens).doc(hashToken(token));
  }

  newId(): string {
    return this.col(TENANT_COLLECTION.surveyTemplates).doc().id;
  }

  // ── Templates ─────────────────────────────────────────────

  async createTemplate(fields: Omit<SurveyTemplate, keyof BaseDocument>): Promise<SurveyTemplate> {
    const ref = this.col(TENANT_COLLECTION.surveyTemplates).doc();
    const item: SurveyTemplate = { ...createBaseFields(ref.id, this.tenantContext.getUserId()), ...fields };
    await ref.set(item);
    await this.audit.record({ action: AuditAction.SURVEY_TEMPLATE_CREATED, entity: 'surveyTemplate', entityId: item.id });
    return item;
  }

  async saveTemplate(item: SurveyTemplate): Promise<SurveyTemplate> {
    const updated = { ...item, ...touchBaseFields(this.tenantContext.getUserId()) };
    await this.col(TENANT_COLLECTION.surveyTemplates).doc(item.id).set(updated);
    await this.audit.record({ action: AuditAction.SURVEY_TEMPLATE_UPDATED, entity: 'surveyTemplate', entityId: item.id });
    return updated;
  }

  async deleteTemplate(item: SurveyTemplate): Promise<void> {
    await this.col(TENANT_COLLECTION.surveyTemplates)
      .doc(item.id)
      .set({ ...item, deletedAt: new Date().toISOString(), ...touchBaseFields(this.tenantContext.getUserId()) });
    await this.audit.record({ action: AuditAction.SURVEY_TEMPLATE_DELETED, entity: 'surveyTemplate', entityId: item.id });
  }

  async getTemplateOrThrow(id: string): Promise<SurveyTemplate> {
    const snapshot = await this.col(TENANT_COLLECTION.surveyTemplates).doc(id).get();
    const item = snapshot.exists ? (snapshot.data() as SurveyTemplate) : null;
    if (!item || isDeleted(item)) {
      throw new AppException(ErrorCode.SURVEY_NOT_FOUND, 'Anket bulunamadı');
    }
    return item;
  }

  async listTemplates(): Promise<SurveyTemplate[]> {
    const snapshot = await this.col(TENANT_COLLECTION.surveyTemplates).get();
    return snapshot.docs
      .map((doc) => doc.data() as SurveyTemplate)
      .filter((item) => !isDeleted(item))
      .sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  }

  // ── Invites ───────────────────────────────────────────────

  /** Writes the invite and its public lookup doc together. */
  async createInvite(fields: Omit<SurveyInvite, keyof BaseDocument>): Promise<SurveyInvite> {
    const tenantId = this.tenantContext.getTenantId();
    const ref = this.col(TENANT_COLLECTION.surveyInvites).doc();
    const item: SurveyInvite = { ...createBaseFields(ref.id, this.tenantContext.getUserId()), ...fields };
    const lookup: SurveyTokenLookup = {
      tenantId,
      inviteId: item.id,
      customerId: item.customerId,
      patientId: item.patientId,
      expiresAt: item.expiresAt,
      answeredAt: null,
      cancelled: false,
    };
    const batch = this.firebase.db.batch();
    batch.set(ref, item);
    batch.set(this.lookupRef(item.token), lookup);
    await batch.commit();
    await this.audit.record({ action: AuditAction.SURVEY_SENT, entity: 'surveyInvite', entityId: item.id });
    return item;
  }

  async getInviteOrThrow(id: string): Promise<SurveyInvite> {
    const snapshot = await this.col(TENANT_COLLECTION.surveyInvites).doc(id).get();
    const item = snapshot.exists ? (snapshot.data() as SurveyInvite) : null;
    if (!item || isDeleted(item)) {
      throw new AppException(ErrorCode.SURVEY_NOT_FOUND, 'Anket gönderimi bulunamadı');
    }
    return item;
  }

  /** Invites created on or after `fromIso` (all when omitted). */
  async listInvites(fromIso?: string): Promise<SurveyInvite[]> {
    let query: FirebaseFirestore.Query = this.col(TENANT_COLLECTION.surveyInvites);
    if (fromIso) {
      query = query.where('createdAt', '>=', fromIso);
    }
    const snapshot = await query.get();
    return snapshot.docs.map((doc) => doc.data() as SurveyInvite).filter((item) => !isDeleted(item));
  }

  async cancelInvite(item: SurveyInvite): Promise<SurveyInvite> {
    const updated: SurveyInvite = { ...item, status: 'cancelled', ...touchBaseFields(this.tenantContext.getUserId()) };
    const batch = this.firebase.db.batch();
    batch.set(this.col(TENANT_COLLECTION.surveyInvites).doc(item.id), updated);
    batch.set(this.lookupRef(item.token), { cancelled: true }, { merge: true });
    await batch.commit();
    return updated;
  }

  // ── Public (no tenant context) ────────────────────────────

  async findLookup(token: string): Promise<SurveyTokenLookup | null> {
    const snapshot = await this.lookupRef(token).get();
    return snapshot.exists ? (snapshot.data() as SurveyTokenLookup) : null;
  }

  async findInviteForTenant(tenantId: string, inviteId: string): Promise<SurveyInvite | null> {
    const snapshot = await this.col(TENANT_COLLECTION.surveyInvites, tenantId).doc(inviteId).get();
    const item = snapshot.exists ? (snapshot.data() as SurveyInvite) : null;
    return item && !isDeleted(item) ? item : null;
  }

  async tenantBranding(tenantId: string): Promise<{ name: string; logoUrl: string | null }> {
    const snapshot = await this.firebase.db.collection(ROOT_COLLECTION.tenants).doc(tenantId).get();
    const data = (snapshot.data() ?? {}) as { name?: string; logoUrl?: string | null };
    return { name: data.name || 'Klinik', logoUrl: data.logoUrl ?? null };
  }

  /**
   * Stores the answers once. The lookup doc is the lock: a transaction marks it answered and
   * fails when another submit got there first.
   */
  async submitAnswers(token: string, apply: (invite: SurveyInvite) => SurveyInvite): Promise<SurveyInvite> {
    const lookupRef = this.lookupRef(token);
    return this.firebase.db.runTransaction(async (tx) => {
      const lookupSnap = await tx.get(lookupRef);
      const lookup = lookupSnap.exists ? (lookupSnap.data() as SurveyTokenLookup) : null;
      if (!lookup || lookup.cancelled) {
        throw new AppException(ErrorCode.SURVEY_LINK_INVALID, 'Anket bağlantısı geçersiz');
      }
      if (lookup.answeredAt) {
        throw new AppException(ErrorCode.SURVEY_ALREADY_ANSWERED, 'Bu anket daha önce yanıtlandı');
      }
      if (lookup.expiresAt < new Date().toISOString()) {
        throw new AppException(ErrorCode.SURVEY_LINK_INVALID, 'Anket bağlantısının süresi doldu');
      }
      const inviteRef = this.col(TENANT_COLLECTION.surveyInvites, lookup.tenantId).doc(lookup.inviteId);
      const inviteSnap = await tx.get(inviteRef);
      const invite = inviteSnap.exists ? (inviteSnap.data() as SurveyInvite) : null;
      if (!invite || isDeleted(invite) || invite.status === 'cancelled') {
        throw new AppException(ErrorCode.SURVEY_LINK_INVALID, 'Anket bağlantısı geçersiz');
      }
      const updated = apply(invite);
      tx.set(inviteRef, updated);
      tx.set(lookupRef, { ...lookup, answeredAt: updated.answeredAt });
      return updated;
    });
  }

  // ── Names for an invite ───────────────────────────────────

  async customerAndPatient(
    customerId: string,
    patientId: string | null,
  ): Promise<{ customerName: string; customerPhone: string | null; patientName: string | null } | null> {
    const [customerSnap, patientSnap] = await Promise.all([
      this.col(TENANT_COLLECTION.customers).doc(customerId).get(),
      patientId ? this.col(TENANT_COLLECTION.patients).doc(patientId).get() : Promise.resolve(null),
    ]);
    const customer = customerSnap.exists
      ? (customerSnap.data() as { firstName?: string; lastName?: string; phone?: string; deletedAt?: string | null })
      : null;
    if (!customer || isDeleted(customer)) {
      return null;
    }
    const patient = patientSnap?.exists ? (patientSnap.data() as { name?: string; customerId?: string }) : null;
    return {
      customerName: `${customer.firstName ?? ''} ${customer.lastName ?? ''}`.trim(),
      customerPhone: customer.phone || null,
      patientName: patient && patient.customerId === customerId ? patient.name ?? null : null,
    };
  }
}
