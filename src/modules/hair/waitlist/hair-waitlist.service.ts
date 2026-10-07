import { Injectable } from '@nestjs/common';
import { TENANT_COLLECTION } from '../../../shared/firebase/firestore-path';
import { HairListQueryDto } from '../shared/hair-list.dto';
import { HairStore } from '../shared/hair-store';
import { fullName, str } from '../shared/hair-tx';
import { CreateHairWaitlistDto, UpdateHairWaitlistDto } from './waitlist.dto';

const NOT_FOUND = 'Bekleme listesi kaydı bulunamadı.';

@Injectable()
export class HairWaitlistService {
  constructor(private readonly store: HairStore) {}

  async list(query: HairListQueryDto) {
    const actor = await this.store.actorOrThrow();
    const branch = this.store.branchFilter(actor, query.branchId);
    return this.store.list(TENANT_COLLECTION.hairWaitlist, {
      equals: { branchId: branch.equals, status: query.status, customerId: query.customerId },
      anyOf: branch.anyOf ? { field: 'branchId', values: branch.anyOf } : undefined,
      match: (item) => !query.date || item['preferredDate'] === query.date,
      orderBy: { field: 'createdAt', dir: 'asc' },
      limit: query.limit,
      cursor: query.cursor,
    });
  }

  async create(dto: CreateHairWaitlistDto) {
    const actor = await this.store.actorOrThrow();
    this.store.assertBranchAccess(actor, dto.branchId);
    const customer = await this.store.getOrThrow(TENANT_COLLECTION.hairCustomers, dto.customerId, 'Müşteri bulunamadı.');
    const serviceNames: string[] = [];
    for (const serviceId of dto.serviceIds) {
      const service = await this.store.getOrThrow(TENANT_COLLECTION.hairServices, serviceId, `Hizmet bulunamadı: ${serviceId}`);
      serviceNames.push(str(service['name']));
    }
    if (dto.preferredStaffId) {
      await this.store.getOrThrow(TENANT_COLLECTION.hairStaff, dto.preferredStaffId, 'Personel bulunamadı.');
    }
    return this.store.create(TENANT_COLLECTION.hairWaitlist, 'hairWaitlist', {
      ...dto,
      customerName: fullName(customer),
      customerPhone: str(customer['phone']),
      serviceNames,
      status: 'waiting',
    });
  }

  async update(id: string, dto: UpdateHairWaitlistDto) {
    const actor = await this.store.actorOrThrow();
    const current = await this.store.getOrThrow(TENANT_COLLECTION.hairWaitlist, id, NOT_FOUND);
    this.store.assertBranchAccess(actor, str(current['branchId']));
    return this.store.update(TENANT_COLLECTION.hairWaitlist, 'hairWaitlist', id, dto, NOT_FOUND);
  }

  async remove(id: string) {
    const actor = await this.store.actorOrThrow();
    const current = await this.store.getOrThrow(TENANT_COLLECTION.hairWaitlist, id, NOT_FOUND);
    this.store.assertBranchAccess(actor, str(current['branchId']));
    return this.store.softDelete(TENANT_COLLECTION.hairWaitlist, 'hairWaitlist', id, NOT_FOUND);
  }
}
