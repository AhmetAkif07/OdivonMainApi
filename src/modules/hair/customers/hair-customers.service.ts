import { Injectable } from '@nestjs/common';
import { DocumentReference, Transaction } from 'firebase-admin/firestore';
import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { TENANT_COLLECTION } from '../../../shared/firebase/firestore-path';
import { touchBaseFields } from '../../../shared/firestore/base-document';
import { assertNoRelated, hairForbidden, hairInvalid, hairNotFound, hairPrecondition } from '../shared/hair-errors';
import { HairListQueryDto, searchTerm } from '../shared/hair-list.dto';
import { isDateId, round2 } from '../shared/hair-money';
import { normalizePhone } from '../shared/hair-phone';
import { HairDoc, HairStore } from '../shared/hair-store';
import { dateIdInTz } from '../shared/hair-time';
import { fullName, live, matchesSearch, num, str } from '../shared/hair-tx';
import {
  CONSENT_FIELDS,
  ConsentChannel,
  CreateHairCustomerDto,
  MergeHairCustomerDto,
  UpdateHairCustomerDto,
} from './customer.dto';

const NOT_FOUND = 'Müşteri bulunamadı.';
const PHONE_TAKEN = 'Bu telefon numarasıyla kayıtlı bir müşteri zaten var.';
/** Collections whose rows point at a customer — re-pointed when duplicates are merged. */
const CUSTOMER_LINKED = [
  TENANT_COLLECTION.hairAppointments,
  TENANT_COLLECTION.hairPayments,
  TENANT_COLLECTION.hairSessions,
  TENANT_COLLECTION.hairFormulas,
  TENANT_COLLECTION.hairMedia,
  TENANT_COLLECTION.hairCustomerPackages,
  TENANT_COLLECTION.hairWaitlist,
  TENANT_COLLECTION.hairReviews,
];
const BATCH_SIZE = 400;
/** Shown instead of the name on an anonymised customer and on the records that still point at it. */
export const ANONYMOUS_NAME = 'Anonim Müşteri';
/** Rows that keep (financial) history but carry a copy of the customer's name / phone. */
const NAME_COPIES = [
  TENANT_COLLECTION.hairAppointments,
  TENANT_COLLECTION.hairSessions,
  TENANT_COLLECTION.hairPayments,
  TENANT_COLLECTION.hairCustomerPackages,
  TENANT_COLLECTION.hairWaitlist,
  TENANT_COLLECTION.hairReviews,
];

@Injectable()
export class HairCustomersService {
  constructor(private readonly store: HairStore) {}

  list(query: HairListQueryDto) {
    const term = searchTerm(query);
    const digits = term?.replace(/\D/g, '');
    return this.store.list(TENANT_COLLECTION.hairCustomers, {
      match: (item) =>
        !term ||
        matchesSearch(item, term, ['firstName', 'lastName', 'email']) ||
        `${str(item['firstName'])} ${str(item['lastName'])}`.toLocaleLowerCase('tr').includes(term) ||
        (!!digits && digits.length >= 3 && str(item['phone']).replace(/\D/g, '').includes(digits)),
      orderBy: { field: 'firstName', dir: 'asc' },
      limit: query.limit,
      cursor: query.cursor,
    });
  }

  get(id: string) {
    return this.store.getOrThrow(TENANT_COLLECTION.hairCustomers, id, NOT_FOUND);
  }

  /** Creates the customer and reserves its phone (`hairCustomerPhones/{e164}`) atomically. */
  async create(dto: CreateHairCustomerDto, defaults: Partial<HairDoc> = {}) {
    const phone = requirePhone(dto.phone);
    await this.assertBirthDate(dto.birthDate);
    const ref = this.store.newRef(TENANT_COLLECTION.hairCustomers);
    const doc = await this.store.runTransaction(async (tx) => {
      const lockRef = this.store.ref(TENANT_COLLECTION.hairCustomerPhones, phone);
      await this.assertPhoneFree(tx, lockRef, null);
      const item = this.store.stamp(ref, {
        firstName: dto.firstName.trim(),
        lastName: (dto.lastName ?? '').trim(),
        phone,
        email: dto.email?.trim().toLowerCase(),
        gender: dto.gender,
        birthDate: dto.birthDate,
        notes: dto.notes,
        allergies: dto.allergies,
        lastPatchTestDate: dto.lastPatchTestDate,
        tags: dto.tags ?? [],
        preferredStaffId: dto.preferredStaffId,
        preferredBranchId: dto.preferredBranchId,
        source: dto.source ?? 'walk-in',
        totalVisits: 0,
        totalSpent: 0,
        noShowCount: 0,
        consentSms: dto.consentSms ?? false,
        consentEmail: dto.consentEmail ?? false,
        consentWhatsapp: dto.consentWhatsapp ?? false,
        consentCommercialIys: dto.consentCommercialIys ?? false,
        consentPhotos: dto.consentPhotos ?? false,
        photoUrl: dto.photoUrl,
        active: dto.active ?? true,
        ...defaults,
      });
      tx.set(ref, item);
      tx.set(lockRef, { phone, customerId: ref.id });
      return item;
    });
    await this.store.audit('hairCustomers', 'create', ref.id, null, doc);
    await this.logConsents(ref.id, null, doc, dto.consentChannel ?? (doc['source'] === 'online' ? 'online' : 'panel'));
    return doc;
  }

  /** Customer with this phone, or a new one (public booking). Returns the customer doc. */
  async findOrCreateByPhone(dto: CreateHairCustomerDto, source: 'online' | 'phone' = 'online') {
    const phone = requirePhone(dto.phone);
    const lock = await this.store.find(TENANT_COLLECTION.hairCustomerPhones, phone);
    const customerId = lock ? str(lock['customerId']) : '';
    if (customerId) {
      const existing = await this.store.find(TENANT_COLLECTION.hairCustomers, customerId);
      if (existing) return existing;
    }
    try {
      return await this.create({ ...dto, phone, source });
    } catch (error) {
      // Lost a race with a parallel booking for the same phone: use the winner's record.
      const again = await this.store.find(TENANT_COLLECTION.hairCustomerPhones, phone);
      const winner = again ? await this.store.find(TENANT_COLLECTION.hairCustomers, str(again['customerId'])) : null;
      if (winner) return winner;
      throw error;
    }
  }

  /** Profile edit; consent flag changes are recorded with time, user and channel (KVKK). */
  async update(id: string, dto: UpdateHairCustomerDto) {
    const before = await this.get(id);
    if (before['anonymizedAt']) throw hairForbidden('Anonimleştirilmiş müşteri düzenlenemez.');
    const updated = await this.applyUpdate(id, dto);
    await this.logConsents(id, before, updated, dto.consentChannel ?? 'panel');
    return updated;
  }

  private async applyUpdate(id: string, dto: UpdateHairCustomerDto): Promise<HairDoc> {
    const current = await this.get(id);
    await this.assertBirthDate(dto.birthDate);
    const patch: Record<string, unknown> = { ...dto };
    delete patch['consentChannel'];
    if (dto.firstName !== undefined) patch['firstName'] = dto.firstName.trim();
    if (dto.lastName !== undefined) patch['lastName'] = dto.lastName.trim();
    if (dto.email !== undefined) patch['email'] = dto.email.trim().toLowerCase();
    const oldPhone = str(current['phone']);
    const newPhone = dto.phone !== undefined ? requirePhone(dto.phone) : oldPhone;
    patch['phone'] = newPhone;

    if (newPhone === oldPhone) {
      return this.store.update(TENANT_COLLECTION.hairCustomers, 'hairCustomers', id, patch, NOT_FOUND);
    }
    const ref = this.store.ref(TENANT_COLLECTION.hairCustomers, id);
    const updated = await this.store.runTransaction(async (tx) => {
      const newLockRef = this.store.ref(TENANT_COLLECTION.hairCustomerPhones, newPhone);
      await this.assertPhoneFree(tx, newLockRef, id);
      const doc = { ...current, ...stripUndefined(patch), ...touchBaseFields(this.store.userId()) };
      tx.set(ref, doc);
      tx.set(newLockRef, { phone: newPhone, customerId: id });
      if (oldPhone) tx.delete(this.store.ref(TENANT_COLLECTION.hairCustomerPhones, oldPhone));
      return doc;
    });
    await this.store.audit('hairCustomers', 'update', id, { phone: oldPhone }, stripUndefined(patch));
    return updated;
  }

  /** Only a customer without history can be removed; otherwise 409 HAS_RELATED_RECORDS (deactivate instead). */
  async remove(id: string) {
    const current = await this.get(id);
    const byCustomer = { field: 'customerId', op: '==' as const, value: id };
    const [appointments, sessions, payments, packages, formulas] = await Promise.all([
      this.store.rows(TENANT_COLLECTION.hairAppointments, byCustomer),
      this.store.rows(TENANT_COLLECTION.hairSessions, byCustomer),
      this.store.rows(TENANT_COLLECTION.hairPayments, byCustomer),
      this.store.rows(TENANT_COLLECTION.hairCustomerPackages, byCustomer),
      this.store.rows(TENANT_COLLECTION.hairFormulas, byCustomer),
    ]);
    assertNoRelated('Müşterinin geçmiş kayıtları var; silmek yerine pasifleştirin.', {
      appointments: appointments.length,
      sessions: sessions.length,
      payments: payments.length,
      customerPackages: packages.length,
      formulas: formulas.length,
    });
    const result = await this.store.softDelete(TENANT_COLLECTION.hairCustomers, 'hairCustomers', id, NOT_FOUND);
    await this.releasePhone(str(current['phone']), id);
    return result;
  }

  /** Consent changes of one customer, newest first. */
  async consents(id: string) {
    await this.get(id);
    const rows = await this.store.rows(TENANT_COLLECTION.hairConsentLogs, { field: 'customerId', op: '==', value: id });
    return rows.sort((a, b) => str(b['at']).localeCompare(str(a['at'])));
  }

  /**
   * KVKK erasure (admin only): blanks the customer's personal data, frees the phone, scrubs the
   * name/phone copies on appointments, sessions, payments, packages and the SMS log, hard-deletes
   * formulas and media, and redacts earlier audit snapshots. Amounts and dates stay for the books.
   * Media files in Storage are not reachable from the API: their paths are returned for the client.
   */
  async anonymize(id: string) {
    const actor = await this.store.actorOrThrow();
    if (actor.role !== 'admin') throw hairForbidden('Müşteri anonimleştirme yalnızca yönetici tarafından yapılabilir.');
    const current = await this.get(id);
    if (current['anonymizedAt']) throw hairPrecondition('Müşteri zaten anonimleştirilmiş.');
    const now = new Date().toISOString();
    const userId = this.store.userId();
    const phone = str(current['phone']);

    const byCustomer = (name: string) => this.store.collection(name).where('customerId', '==', id).get();
    for (const name of NAME_COPIES) {
      const snapshot = await byCustomer(name);
      await this.inBatches(snapshot.docs, (batch, doc) => {
        const data = doc.data();
        batch.update(doc.ref, {
          ...('customerName' in data ? { customerName: ANONYMOUS_NAME } : {}),
          ...('customerPhone' in data ? { customerPhone: '' } : {}),
          ...('notes' in data && name === TENANT_COLLECTION.hairAppointments ? { notes: '' } : {}),
          updatedAt: now,
          updatedBy: userId,
        });
      });
    }
    const smsLog = await byCustomer(TENANT_COLLECTION.hairNotifications);
    await this.inBatches(smsLog.docs, (batch, doc) => batch.update(doc.ref, { to: '', toMasked: '', body: '[anonimleştirildi]' }));

    const [formulas, media] = await Promise.all([byCustomer(TENANT_COLLECTION.hairFormulas), byCustomer(TENANT_COLLECTION.hairMedia)]);
    const storagePaths = media.docs.map((doc) => str(doc.data()['storagePath'])).filter(Boolean);
    await this.inBatches([...formulas.docs, ...media.docs], (batch, doc) => batch.delete(doc.ref));

    const audits = await this.store
      .collection(TENANT_COLLECTION.hairAuditLogs)
      .where('entityId', '==', id)
      .get();
    await this.inBatches(
      audits.docs.filter((doc) => doc.data()['entity'] === 'hairCustomers'),
      (batch, doc) => batch.update(doc.ref, { before: null, after: { redacted: true } }),
    );

    const anonymized = {
      firstName: ANONYMOUS_NAME,
      lastName: '',
      phone: '',
      email: null,
      gender: null,
      birthDate: null,
      notes: null,
      allergies: null,
      lastPatchTestDate: null,
      tags: [],
      photoUrl: null,
      preferredStaffId: null,
      consentSms: false,
      consentEmail: false,
      consentWhatsapp: false,
      consentCommercialIys: false,
      consentPhotos: false,
      active: false,
      anonymizedAt: now,
      anonymizedBy: userId,
      updatedAt: now,
      updatedBy: userId,
    };
    await this.store.doc(TENANT_COLLECTION.hairCustomers, id).update(anonymized);
    await this.releasePhone(phone, id);
    if (phone) await this.store.doc(TENANT_COLLECTION.hairBookingOtps, phone).delete();
    await this.logConsents(id, current, { ...current, ...anonymized }, 'anonymization');
    const result = { formulasDeleted: formulas.size, mediaDeleted: media.size, storagePaths };
    await this.store.audit('hairCustomers', 'callable', id, null, { anonymized: true, ...result, storagePaths: storagePaths.length });
    return { ...(await this.get(id)), anonymization: result } as HairDoc & { anonymization: typeof result };
  }

  /** Appointment, payment and package history of one customer (newest first). */
  async history(id: string) {
    await this.get(id);
    const byCustomer = { field: 'customerId', op: '==' as const, value: id };
    const [appointments, payments, packages] = await Promise.all([
      this.store.rows(TENANT_COLLECTION.hairAppointments, byCustomer),
      this.store.rows(TENANT_COLLECTION.hairPayments, byCustomer),
      this.store.rows(TENANT_COLLECTION.hairCustomerPackages, byCustomer),
    ]);
    const desc = (field: string) => (a: HairDoc, b: HairDoc) => str(b[field]).localeCompare(str(a[field]));
    return {
      appointments: appointments.sort(desc('startAt')),
      payments: payments.sort(desc('createdAt')),
      packages: packages.sort(desc('startDate')),
    };
  }

  /**
   * Merges the duplicate `sourceId` into `targetId`: re-points every linked row, sums the visit and
   * spend counters, then removes the duplicate and frees its phone.
   */
  async merge(targetId: string, dto: MergeHairCustomerDto) {
    if (dto.sourceId === targetId) throw hairInvalid('Bir müşteri kendisiyle birleştirilemez.');
    const [target, source] = await Promise.all([this.get(targetId), this.store.find(TENANT_COLLECTION.hairCustomers, dto.sourceId)]);
    if (!source) throw hairNotFound('Birleştirilecek müşteri bulunamadı.');
    const targetName = fullName(target);
    const now = new Date().toISOString();
    const userId = this.store.userId();

    let moved = 0;
    for (const name of CUSTOMER_LINKED) {
      const snapshot = await this.store.collection(name).where('customerId', '==', dto.sourceId).get();
      for (let i = 0; i < snapshot.docs.length; i += BATCH_SIZE) {
        const batch = this.store.db.batch();
        for (const doc of snapshot.docs.slice(i, i + BATCH_SIZE)) {
          const data = doc.data();
          batch.update(doc.ref, {
            customerId: targetId,
            ...('customerName' in data ? { customerName: targetName } : {}),
            updatedAt: now,
            updatedBy: userId,
          });
        }
        await batch.commit();
      }
      moved += snapshot.docs.length;
    }

    const lastVisit = [str(target['lastVisitDate']), str(source['lastVisitDate'])].sort().pop() || undefined;
    const tags = [...new Set([...(asStrings(target['tags'])), ...asStrings(source['tags'])])];
    const merged = await this.store.update(
      TENANT_COLLECTION.hairCustomers,
      'hairCustomers',
      targetId,
      {
        totalVisits: num(target['totalVisits']) + num(source['totalVisits']),
        totalSpent: round2(num(target['totalSpent']) + num(source['totalSpent'])),
        noShowCount: num(target['noShowCount']) + num(source['noShowCount']),
        lastVisitDate: lastVisit,
        tags,
        notes: [str(target['notes']), str(source['notes'])].filter(Boolean).join('\n') || undefined,
      },
      NOT_FOUND,
    );
    await this.store.doc(TENANT_COLLECTION.hairCustomers, dto.sourceId).update({
      deletedAt: now,
      mergedInto: targetId,
      ...touchBaseFields(userId),
    });
    await this.releasePhone(str(source['phone']), dto.sourceId);
    await this.store.audit('hairCustomers', 'callable', targetId, { mergedFrom: dto.sourceId }, { movedRows: moved });
    return { customer: merged, movedRows: moved };
  }

  /** One `hairConsentLogs` row per consent flag that changed (created: every granted flag). */
  private async logConsents(customerId: string, before: HairDoc | null, after: HairDoc, channel: ConsentChannel) {
    const at = new Date().toISOString();
    const changes = CONSENT_FIELDS.filter((field) => (before ? before[field] === true : false) !== (after[field] === true));
    for (const field of changes) {
      const ref = this.store.newRef(TENANT_COLLECTION.hairConsentLogs);
      await ref.set(
        this.store.stamp(ref, { customerId, consent: field, granted: after[field] === true, channel, at, by: this.store.userId() }),
      );
    }
  }

  private async inBatches<T extends { ref: DocumentReference }>(
    docs: T[],
    write: (batch: FirebaseFirestore.WriteBatch, doc: T) => void,
  ) {
    for (let i = 0; i < docs.length; i += BATCH_SIZE) {
      const batch = this.store.db.batch();
      for (const doc of docs.slice(i, i + BATCH_SIZE)) write(batch, doc);
      await batch.commit();
    }
  }

  /**
   * 409 DUPLICATE_PHONE (with the holder's id and name) when another live customer owns the phone.
   * A lock left behind by a removed customer is simply taken over.
   */
  private async assertPhoneFree(tx: Transaction, lockRef: DocumentReference, selfId: string | null) {
    const lock = await tx.get(lockRef);
    const holderId = lock.exists ? str(lock.data()?.['customerId']) : '';
    if (!holderId || holderId === selfId) return;
    const holder = live(await tx.get(this.store.ref(TENANT_COLLECTION.hairCustomers, holderId)));
    if (holder) {
      throw new AppException(ErrorCode.DUPLICATE_PHONE, PHONE_TAKEN, { customerId: holder.id, customerName: fullName(holder) });
    }
  }

  /** Birth date must be a real calendar day that is not in the future (salon time zone). */
  private async assertBirthDate(value: string | undefined) {
    if (value === undefined) return;
    if (!isDateId(value)) throw hairInvalid('Geçersiz doğum tarihi.');
    if (value > dateIdInTz(await this.store.timeZone())) throw hairInvalid('Doğum tarihi gelecekte olamaz.');
  }

  private async releasePhone(phone: string, customerId: string) {
    if (!phone) return;
    const ref = this.store.ref(TENANT_COLLECTION.hairCustomerPhones, phone);
    await this.store.runTransaction(async (tx) => {
      const lock = live(await tx.get(ref));
      if (lock?.['customerId'] === customerId) tx.delete(ref);
    });
  }
}

function requirePhone(input: string): string {
  const phone = normalizePhone(input);
  if (!phone) throw hairInvalid('Geçerli bir telefon numarası girin (ör. 0532 123 45 67).');
  return phone;
}

function asStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function stripUndefined(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined));
}
