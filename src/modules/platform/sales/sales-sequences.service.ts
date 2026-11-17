import { Injectable, Logger } from '@nestjs/common';
import { FirebaseService } from '../../../shared/firebase/firebase.service';
import { ROOT_COLLECTION } from '../../../shared/firebase/firestore-path';
import { createBaseFields } from '../../../shared/firestore/base-document';
import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { PlatformAuditService } from '../audit/platform-audit.service';
import { PlatformAdminUser } from '../platform-admin.guard';
import { leadContact } from '../ai-research/lead-fields';
import { SalesChannelsService } from './sales-channels.service';
import { findLibraryTemplate, isLibraryId } from './sales-template-library';
import { nextBusinessSlot } from './sales-scoring';
import { PlatformSalesService } from './sales.service';
import { SALES_SEQUENCE_MAX_STEPS, SALES_SEQUENCE_RUN_LIMIT, SalesChannel, SalesOfferKind } from './sales.config';

type Doc = Record<string, any>;
const DAY_MS = 86_400_000;

export interface SequenceStep {
  /** Kayıttan kaç gün sonra (0 = hemen). */
  day: number;
  channel: SalesChannel;
  templateId: string;
  kind?: SalesOfferKind;
}

/** Dizinin kendisi çalışırken denetim kaydında görünen kullanıcı. */
const AUTOMATION: PlatformAdminUser = { uid: 'sales-automation', email: 'otomatik-takip@odivon' } as PlatformAdminUser;

/** Lead bu aşamalardaysa dizi durur (cevap geldi, demo, kazanıldı...). */
const STOP_STATUSES = new Set(['replied', 'demo', 'won', 'lost', 'ignored']);

/**
 * Otomatik takip dizileri: ör. 0. gün e-posta broşürü, 3. gün WhatsApp, 7. gün SMS. Saatlik cron
 * her çalıştığında zamanı gelen adımları gönderir; sağlayıcısı bağlı olmayan kanal için gönderim
 * yerine "Takipler" listesine elle gönderilecek bir görev (wa.me / sms: bağlantılı) düşer.
 * Lead cevap verince, demo isteyince, abonelikten çıkınca ya da kazanılınca dizi durur.
 */
@Injectable()
export class SalesSequencesService {
  private readonly logger = new Logger(SalesSequencesService.name);

  constructor(
    private readonly firebase: FirebaseService,
    private readonly sales: PlatformSalesService,
    private readonly channels: SalesChannelsService,
    private readonly audit: PlatformAuditService,
  ) {}

  private sequences() {
    return this.firebase.db.collection(ROOT_COLLECTION.salesSequences);
  }

  private enrollments() {
    return this.firebase.db.collection(ROOT_COLLECTION.salesEnrollments);
  }

  private leads() {
    return this.firebase.db.collection(ROOT_COLLECTION.aiLeads);
  }

  private activities() {
    return this.firebase.db.collection(ROOT_COLLECTION.salesActivities);
  }

  private async validateSteps(steps: SequenceStep[]): Promise<SequenceStep[]> {
    if (!steps?.length) throw new AppException(ErrorCode.VALIDATION_ERROR, 'Dizide en az bir adım olmalı');
    if (steps.length > SALES_SEQUENCE_MAX_STEPS) {
      throw new AppException(ErrorCode.VALIDATION_ERROR, `Bir dizide en fazla ${SALES_SEQUENCE_MAX_STEPS} adım olabilir`);
    }
    const sorted = [...steps].map((s) => ({ ...s, day: Math.max(0, Math.round(Number(s.day) || 0)) })).sort((a, b) => a.day - b.day);
    for (const s of sorted) {
      const t: Doc | undefined = isLibraryId(s.templateId)
        ? (findLibraryTemplate(s.templateId) as Doc | undefined)
        : (await this.firebase.db.collection(ROOT_COLLECTION.salesTemplates).doc(s.templateId).get()).data();
      if (!t || t.deletedAt) throw new AppException(ErrorCode.CRM_NOT_FOUND, `Şablon bulunamadı: ${s.templateId}`);
      if (t.channel !== s.channel) throw new AppException(ErrorCode.VALIDATION_ERROR, `${t.name}: şablon kanalı adımın kanalıyla aynı değil`);
      s.kind = s.kind ?? t.kind;
    }
    return sorted;
  }

  async list() {
    const [seqs, enr] = await Promise.all([this.sequences().get(), this.enrollments().get()]);
    const stats = new Map<string, { active: number; completed: number; stopped: number }>();
    for (const e of enr.docs) {
      const d = e.data();
      const s = stats.get(d.sequenceId) ?? { active: 0, completed: 0, stopped: 0 };
      s[d.status as 'active' | 'completed' | 'stopped'] = (s[d.status as 'active'] ?? 0) + 1;
      stats.set(d.sequenceId, s);
    }
    return seqs.docs
      .map((d) => d.data() as Doc)
      .filter((d) => !d.deletedAt)
      .map((d): Doc => ({ ...d, stats: stats.get(d.id) ?? { active: 0, completed: 0, stopped: 0 } }))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  async create(dto: { name: string; product?: string | null; steps: SequenceStep[]; active?: boolean }, admin: PlatformAdminUser) {
    const steps = await this.validateSteps(dto.steps);
    const ref = this.sequences().doc();
    const now = new Date().toISOString();
    const doc = {
      ...createBaseFields(ref.id, admin.uid, now),
      name: dto.name.trim(),
      product: dto.product || null,
      steps,
      active: dto.active ?? true,
      createdByEmail: admin.email,
    };
    await ref.set(doc);
    await this.record(admin, 'SALES_SEQUENCE_CREATED', ref.id, { name: doc.name, steps: steps.length });
    return doc;
  }

  async update(id: string, dto: { name?: string; product?: string | null; steps?: SequenceStep[]; active?: boolean }, admin: PlatformAdminUser) {
    const ref = this.sequences().doc(id);
    const snap = await ref.get();
    if (!snap.exists || snap.data()?.deletedAt) throw new AppException(ErrorCode.CRM_NOT_FOUND, 'Dizi bulunamadı');
    const patch: Doc = { updatedAt: new Date().toISOString(), updatedBy: admin.uid };
    if (dto.name !== undefined) patch.name = dto.name.trim();
    if (dto.product !== undefined) patch.product = dto.product || null;
    if (dto.steps !== undefined) patch.steps = await this.validateSteps(dto.steps);
    if (dto.active !== undefined) patch.active = dto.active;
    await ref.update(patch);
    await this.record(admin, 'SALES_SEQUENCE_UPDATED', id, { fields: Object.keys(patch) });
    return { ...(snap.data() as Doc), ...patch };
  }

  async remove(id: string, admin: PlatformAdminUser) {
    const ref = this.sequences().doc(id);
    if (!(await ref.get()).exists) throw new AppException(ErrorCode.CRM_NOT_FOUND, 'Dizi bulunamadı');
    const now = new Date().toISOString();
    await ref.update({ deletedAt: now, active: false, updatedAt: now });
    const active = await this.enrollments().where('sequenceId', '==', id).get();
    const batch = this.firebase.db.batch();
    for (const e of active.docs) if (e.data().status === 'active') batch.update(e.ref, { status: 'stopped', stopReason: 'Dizi silindi', nextRunAt: null, updatedAt: now });
    await batch.commit();
    await this.record(admin, 'SALES_SEQUENCE_DELETED', id, {});
    return { id, deleted: true };
  }

  /** Lead'leri diziye ekler; aynı dizide aktif kaydı olan ya da ret listesindeki atlanır. */
  async enroll(id: string, leadIds: string[], admin: PlatformAdminUser) {
    const seqSnap = await this.sequences().doc(id).get();
    const seq = seqSnap.data();
    if (!seqSnap.exists || !seq || seq.deletedAt) throw new AppException(ErrorCode.CRM_NOT_FOUND, 'Dizi bulunamadı');
    if (!seq.active) throw new AppException(ErrorCode.CRM_INVALID_STATE, 'Dizi pasif');
    const ids = [...new Set(leadIds)].slice(0, 200);
    const leadSnaps = await this.firebase.db.getAll(...ids.map((x) => this.leads().doc(x)));
    const existing = await this.enrollments().where('sequenceId', '==', id).get();
    const activeLeads = new Set(existing.docs.filter((e) => e.data().status === 'active').map((e) => e.data().leadId));
    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    const batch = this.firebase.db.batch();
    let enrolled = 0;
    const skipped: { leadId: string; reason: string }[] = [];
    for (const s of leadSnaps) {
      const d = s.data();
      if (!s.exists || !d) {
        skipped.push({ leadId: s.id, reason: 'Lead bulunamadı' });
        continue;
      }
      if (activeLeads.has(s.id)) {
        skipped.push({ leadId: s.id, reason: 'Zaten bu dizide' });
        continue;
      }
      if (d.pipeline?.optedOut || STOP_STATUSES.has(d.pipeline?.status ?? 'new')) {
        skipped.push({ leadId: s.id, reason: d.pipeline?.optedOut ? 'Ret listesinde' : 'Aşaması uygun değil' });
        continue;
      }
      const c = leadContact(d);
      if (!c.email && !c.mobile) {
        skipped.push({ leadId: s.id, reason: 'E-posta ve cep telefonu yok' });
        continue;
      }
      const ref = this.enrollments().doc();
      const first = seq.steps[0] as SequenceStep;
      batch.set(ref, {
        ...createBaseFields(ref.id, admin.uid, nowIso),
        sequenceId: id,
        sequenceName: seq.name,
        leadId: s.id,
        leadName: d.name ?? null,
        stepIndex: 0,
        totalSteps: seq.steps.length,
        nextRunAt: first.day === 0 ? nowIso : nextBusinessSlot(now + first.day * DAY_MS),
        status: 'active',
        stopReason: null,
        history: [],
        createdByEmail: admin.email,
      });
      enrolled += 1;
    }
    await batch.commit();
    await this.record(admin, 'SALES_SEQUENCE_ENROLLED', id, { enrolled, skipped: skipped.length });
    return { enrolled, skipped };
  }

  async listEnrollments(f: { sequenceId?: string; leadId?: string; status?: string }) {
    const snap = f.sequenceId
      ? await this.enrollments().where('sequenceId', '==', f.sequenceId).get()
      : f.leadId
        ? await this.enrollments().where('leadId', '==', f.leadId).get()
        : await this.enrollments().orderBy('createdAt', 'desc').limit(500).get();
    return snap.docs
      .map((d) => d.data())
      .filter((d) => !f.status || d.status === f.status)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  async stop(enrollmentId: string, admin: PlatformAdminUser) {
    const ref = this.enrollments().doc(enrollmentId);
    const snap = await ref.get();
    if (!snap.exists) throw new AppException(ErrorCode.CRM_NOT_FOUND, 'Kayıt bulunamadı');
    await ref.update({ status: 'stopped', stopReason: `Elle durduruldu (${admin.email})`, nextRunAt: null, updatedAt: new Date().toISOString() });
    return { id: enrollmentId, stopped: true };
  }

  /**
   * Zamanı gelen adımları çalıştırır (cron ve panelden "Şimdi çalıştır"). Workers alt istek sınırı
   * için bir çalıştırmada en fazla SALES_SEQUENCE_RUN_LIMIT kayıt işlenir; `remaining` > 0 ise
   * panel tekrar çağırır.
   */
  async runDue(limit = SALES_SEQUENCE_RUN_LIMIT) {
    const nowIso = new Date().toISOString();
    const due = await this.enrollments().where('nextRunAt', '<=', nowIso).orderBy('nextRunAt').limit(limit + 1).get();
    const docs = due.docs.slice(0, limit);
    const seqCache = new Map<string, Doc | null>();
    let sent = 0;
    let tasks = 0;
    let stopped = 0;
    let failed = 0;
    for (const e of docs) {
      const en = e.data();
      if (en.status !== 'active') {
        await e.ref.update({ nextRunAt: null });
        continue;
      }
      try {
        const r = await this.runOne(e.ref, en, seqCache);
        if (r === 'sent') sent += 1;
        else if (r === 'task') tasks += 1;
        else if (r === 'stopped') stopped += 1;
        else failed += 1;
      } catch (error) {
        failed += 1;
        this.logger.warn(`Sequence enrollment ${e.id} failed: ${(error as Error).message}`);
        await e.ref.update({
          history: [...(en.history ?? []), { step: en.stepIndex, at: nowIso, ok: false, error: (error as Error).message.slice(0, 200) }],
          nextRunAt: new Date(Date.now() + 6 * 3600_000).toISOString(),
          failures: (en.failures ?? 0) + 1,
          ...((en.failures ?? 0) + 1 >= 3 ? { status: 'stopped', stopReason: '3 kez gönderilemedi', nextRunAt: null } : {}),
        });
      }
    }
    return { processed: docs.length, sent, tasks, stopped, failed, remaining: due.docs.length > limit ? 1 : 0 };
  }

  private async runOne(ref: FirebaseFirestore.DocumentReference, en: Doc, cache: Map<string, Doc | null>): Promise<'sent' | 'task' | 'stopped' | 'failed'> {
    const nowIso = new Date().toISOString();
    if (!cache.has(en.sequenceId)) cache.set(en.sequenceId, ((await this.sequences().doc(en.sequenceId).get()).data() as Doc) ?? null);
    const seq = cache.get(en.sequenceId);
    const stopWith = async (reason: string) => {
      await ref.update({ status: 'stopped', stopReason: reason, nextRunAt: null, updatedAt: nowIso });
      return 'stopped' as const;
    };
    if (!seq || seq.deletedAt || !seq.active) return stopWith('Dizi pasif ya da silindi');
    const leadSnap = await this.leads().doc(en.leadId).get();
    const lead = leadSnap.data();
    if (!lead) return stopWith('Lead silindi');
    if (lead.pipeline?.optedOut) return stopWith('Ret listesinde');
    if (STOP_STATUSES.has(lead.pipeline?.status ?? 'new')) return stopWith(`Lead aşaması: ${lead.pipeline?.status}`);

    const step = seq.steps[en.stepIndex] as SequenceStep | undefined;
    if (!step) {
      await ref.update({ status: 'completed', nextRunAt: null, updatedAt: nowIso });
      return 'stopped';
    }
    const c = leadContact(lead);
    const reachable = step.channel === 'email' ? c.email : c.mobile;
    let entry: Doc;
    let outcome: 'sent' | 'task' | 'failed';
    if (!reachable) {
      entry = { step: en.stepIndex, at: nowIso, ok: false, skipped: true, error: step.channel === 'email' ? 'E-posta yok' : 'Cep telefonu yok' };
      outcome = 'failed';
    } else {
      const providerReady =
        step.channel === 'email' ? this.channels.emailConfigured() : step.channel === 'sms' ? this.channels.smsConfigured() : this.channels.whatsappConfigured();
      const res = await this.sales.send(
        {
          channel: step.channel,
          templateId: step.templateId,
          kind: step.kind,
          leadIds: [en.leadId],
          mode: providerReady ? 'api' : 'manual',
          batchId: `seq-${en.sequenceId}`,
        } as Parameters<PlatformSalesService['send']>[0],
        AUTOMATION,
      );
      const r = res.results[0];
      entry = { step: en.stepIndex, at: nowIso, ok: Boolean(r?.ok), offerId: r?.offerId ?? null, mode: r?.deliveryMode ?? null, error: r?.error ?? null };
      outcome = r?.ok ? 'sent' : 'failed';
      if (r?.ok && r.link) {
        // Sağlayıcı yok: yönetici kendi telefonundan gönderir.
        const tRef = this.activities().doc();
        await tRef.set({
          ...createBaseFields(tRef.id, AUTOMATION.uid, nowIso),
          leadId: en.leadId,
          leadName: lead.name ?? null,
          product: seq.product ?? null,
          type: 'followup',
          text: `${seq.name}: ${step.channel === 'whatsapp' ? 'WhatsApp' : 'SMS'} mesajını gönderin (${en.stepIndex + 1}/${seq.steps.length})`,
          link: r.link,
          dueAt: nowIso,
          done: false,
          doneAt: null,
          offerId: r.offerId,
          createdByEmail: AUTOMATION.email,
        });
        outcome = 'task';
      }
    }
    const nextIndex = en.stepIndex + 1;
    const next = seq.steps[nextIndex] as SequenceStep | undefined;
    const startedAt = Date.parse(en.createdAt);
    await ref.update({
      history: [...(en.history ?? []), entry],
      stepIndex: nextIndex,
      status: next ? 'active' : 'completed',
      nextRunAt: next ? nextBusinessSlot(Math.max(Date.now(), startedAt + next.day * DAY_MS)) : null,
      updatedAt: nowIso,
    });
    return outcome;
  }

  private async record(admin: PlatformAdminUser, action: string, targetId: string, after: Record<string, unknown>) {
    await this.audit.record({ adminUid: admin.uid, adminEmail: admin.email, action, targetType: 'sales', targetId, after });
  }
}
