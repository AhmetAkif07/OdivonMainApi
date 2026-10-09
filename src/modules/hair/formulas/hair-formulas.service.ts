import { Injectable } from '@nestjs/common';
import { TENANT_COLLECTION } from '../../../shared/firebase/firestore-path';
import { hairForbidden, hairInvalid, hairPrecondition } from '../shared/hair-errors';
import { HairDoc, HairStore } from '../shared/hair-store';
import { dateIdInTz } from '../shared/hair-time';
import { fullName, str } from '../shared/hair-tx';
import { CreateHairFormulaDto, CreateHairMediaDto, UpdateHairFormulaDto } from './formula.dto';

const CUSTOMER_NOT_FOUND = 'Müşteri bulunamadı.';
const FORMULA_NOT_FOUND = 'Formül bulunamadı.';

/** Hair colour formulas and before/after photos of a customer (plan §4.2, §5.9). */
@Injectable()
export class HairFormulasService {
  constructor(private readonly store: HairStore) {}

  async list(customerId: string) {
    await this.store.getOrThrow(TENANT_COLLECTION.hairCustomers, customerId, CUSTOMER_NOT_FOUND);
    const rows = await this.store.rows(TENANT_COLLECTION.hairFormulas, {
      field: 'customerId',
      op: '==',
      value: customerId,
    });
    return rows.sort(byNewest);
  }

  async create(customerId: string, dto: CreateHairFormulaDto) {
    await this.store.getOrThrow(TENANT_COLLECTION.hairCustomers, customerId, CUSTOMER_NOT_FOUND);
    const actor = await this.store.actorOrThrow();
    const staffId = dto.staffId ?? actor.staffId;
    if (!staffId) throw hairInvalid('Formülü kaydeden personel (staffId) zorunludur.');
    const staff = await this.store.getOrThrow(TENANT_COLLECTION.hairStaff, staffId, 'Personel bulunamadı.');
    return this.store.create(TENANT_COLLECTION.hairFormulas, 'hairFormulas', {
      ...dto,
      customerId,
      staffId,
      staffName: fullName(staff),
      date: dto.date ?? dateIdInTz(await this.store.timeZone()),
      products: dto.products ?? [],
      mediaIds: dto.mediaIds ?? [],
    });
  }

  async update(customerId: string, formulaId: string, dto: UpdateHairFormulaDto) {
    const current = await this.store.getOrThrow(TENANT_COLLECTION.hairFormulas, formulaId, FORMULA_NOT_FOUND);
    if (current['customerId'] !== customerId) throw hairForbidden('Formül bu müşteriye ait değil.');
    const patch: Record<string, unknown> = { ...dto };
    if (dto.staffId && dto.staffId !== current['staffId']) {
      const staff = await this.store.getOrThrow(TENANT_COLLECTION.hairStaff, dto.staffId, 'Personel bulunamadı.');
      patch['staffName'] = fullName(staff);
    }
    return this.store.update(TENANT_COLLECTION.hairFormulas, 'hairFormulas', formulaId, patch, FORMULA_NOT_FOUND);
  }

  async listMedia(customerId: string) {
    await this.store.getOrThrow(TENANT_COLLECTION.hairCustomers, customerId, CUSTOMER_NOT_FOUND);
    const rows = await this.store.rows(TENANT_COLLECTION.hairMedia, {
      field: 'customerId',
      op: '==',
      value: customerId,
    });
    return rows.sort(byNewest);
  }

  /** Records an uploaded photo; refused without the customer's photo consent (V-004). */
  async addMedia(customerId: string, dto: CreateHairMediaDto) {
    const customer = await this.store.getOrThrow(TENANT_COLLECTION.hairCustomers, customerId, CUSTOMER_NOT_FOUND);
    if (customer['consentPhotos'] !== true) {
      throw hairPrecondition('Müşterinin fotoğraf onayı (KVKK) olmadan fotoğraf eklenemez.');
    }
    return this.store.create(TENANT_COLLECTION.hairMedia, 'hairMedia', {
      customerId,
      url: dto.url,
      storagePath: dto.storagePath,
      type: dto.type ?? 'photo',
      contentType: dto.contentType,
      description: dto.description,
      appointmentId: dto.appointmentId,
      uploadedBy: this.store.userId(),
    });
  }
}

function byNewest(a: HairDoc, b: HairDoc) {
  return str(b['date'] ?? b.createdAt).localeCompare(str(a['date'] ?? a.createdAt)) || str(b.createdAt).localeCompare(str(a.createdAt));
}
