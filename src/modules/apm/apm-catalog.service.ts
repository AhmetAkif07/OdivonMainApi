import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { AppException } from '../../shared/errors/app.exception';
import { ErrorCode } from '../../shared/errors/error-codes';
import { FirebaseService } from '../../shared/firebase/firebase.service';
import { ROOT_COLLECTION, TENANT_COLLECTION, tenantCollectionPath } from '../../shared/firebase/firestore-path';
import { TenantContext } from '../../shared/tenancy/tenant.context';
import {
  SaveApmBranchDto,
  SaveApmDeviceTokenDto,
  SaveApmServiceDto,
  SaveApmStaffDto,
  SaveApmTimeOffDto,
  SaveApmWorkingHourDto,
} from './apm-catalog.dto';

export interface ApmDoc {
  id: string;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string | null;
  [key: string]: unknown;
}

@Injectable()
export class ApmCatalogService {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly tenantContext: TenantContext,
  ) {}

  branches() { return this.list(TENANT_COLLECTION.apmBranches); }
  services() { return this.list(TENANT_COLLECTION.apmServices); }
  staff() { return this.list(TENANT_COLLECTION.apmStaff); }
  workingHours() { return this.list(TENANT_COLLECTION.apmWorkingHours); }
  timeOff() { return this.list(TENANT_COLLECTION.apmTimeOff); }

  saveBranch(dto: SaveApmBranchDto, id?: string): Promise<ApmDoc> {
    return this.saveBranchWithSlug(dto, id);
  }

  saveService(dto: SaveApmServiceDto, id?: string): Promise<ApmDoc> {
    this.assertDuration(dto.durationMinutes);
    return this.save(TENANT_COLLECTION.apmServices, dto, id);
  }

  saveStaff(dto: SaveApmStaffDto, id?: string): Promise<ApmDoc> {
    return this.save(TENANT_COLLECTION.apmStaff, dto, id);
  }

  saveWorkingHour(dto: SaveApmWorkingHourDto): Promise<ApmDoc> {
    if (dto.endTime <= dto.startTime) this.invalid('Bitiş saati başlangıç saatinden sonra olmalı.');
    return this.save(
      TENANT_COLLECTION.apmWorkingHours,
      dto,
      `${safeId(dto.branchId)}_${safeId(dto.staffId)}_${dto.weekday}`,
    );
  }

  saveTimeOff(dto: SaveApmTimeOffDto, id?: string): Promise<ApmDoc> {
    if (Date.parse(dto.endAt) <= Date.parse(dto.startAt)) this.invalid('İzin bitişi başlangıçtan sonra olmalı.');
    return this.save(TENANT_COLLECTION.apmTimeOff, dto, id);
  }

  async remove(collection: string, id: string): Promise<{ id: string }> {
    const ref = this.ref(collection, id);
    const snapshot = await ref.get();
    if (!snapshot.exists || snapshot.data()?.['deletedAt']) this.notFound();
    const now = new Date().toISOString();
    await ref.update({ deletedAt: now, updatedAt: now, updatedBy: this.tenantContext.getUserId() });
    return { id };
  }

  async removeBranch(id: string): Promise<{ id: string }> {
    const branch = await this.get(TENANT_COLLECTION.apmBranches, id);
    const slug = String(branch['slug'] ?? '');
    await this.firebase.db.runTransaction(async (tx) => {
      const now = new Date().toISOString();
      tx.update(this.ref(TENANT_COLLECTION.apmBranches, id), {
        deletedAt: now,
        active: false,
        updatedAt: now,
        updatedBy: this.tenantContext.getUserId(),
      });
      if (slug) tx.delete(this.firebase.db.collection(ROOT_COLLECTION.apmPublicBranches).doc(slug));
    });
    return { id };
  }

  async registerAdminDevice(dto: SaveApmDeviceTokenDto): Promise<{ registered: true }> {
    const now = new Date().toISOString();
    const id = tokenId(dto.token);
    await this.ref(TENANT_COLLECTION.apmDeviceTokens, id).set({
      id,
      token: dto.token,
      platform: dto.platform,
      audience: 'admin',
      userId: this.tenantContext.getUserId(),
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }, { merge: true });
    return { registered: true };
  }

  async removeAdminDevice(token: string): Promise<{ removed: true }> {
    await this.ref(TENANT_COLLECTION.apmDeviceTokens, tokenId(token)).delete();
    return { removed: true };
  }

  async get(collection: string, id: string): Promise<ApmDoc> {
    const snapshot = await this.ref(collection, id).get();
    const data = snapshot.exists ? snapshot.data() : undefined;
    if (!data || data['deletedAt']) this.notFound();
    return { id: snapshot.id, ...data } as ApmDoc;
  }

  private async list(collection: string): Promise<ApmDoc[]> {
    const snapshot = await this.collection(collection).get();
    return snapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }) as ApmDoc)
      .filter((doc) => !doc.deletedAt);
  }

  private async save(collection: string, input: object, id?: string): Promise<ApmDoc> {
    const now = new Date().toISOString();
    const userId = this.tenantContext.getUserId();
    const ref = id ? this.ref(collection, id) : this.collection(collection).doc();
    const current = id ? await ref.get() : undefined;
    const doc = {
      ...(current?.exists ? current.data() : { id: ref.id, createdAt: now, createdBy: userId }),
      ...input,
      id: ref.id,
      updatedAt: now,
      updatedBy: userId,
      deletedAt: null,
    };
    await ref.set(doc);
    return doc as ApmDoc;
  }

  private async saveBranchWithSlug(dto: SaveApmBranchDto, id?: string): Promise<ApmDoc> {
    const tenantId = this.tenantContext.getTenantId();
    const userId = this.tenantContext.getUserId();
    const ref = id ? this.ref(TENANT_COLLECTION.apmBranches, id) : this.collection(TENANT_COLLECTION.apmBranches).doc();
    const now = new Date().toISOString();
    const desiredBase = slugify(dto.slug || dto.name) || 'isletme';
    return this.firebase.db.runTransaction(async (tx) => {
      const currentSnapshot = await tx.get(ref);
      const current = currentSnapshot.exists ? currentSnapshot.data() : undefined;
      const oldSlug = String(current?.['slug'] ?? '');
      let slug = desiredBase;
      if (slug !== oldSlug) {
        for (let attempt = 1; attempt <= 100; attempt += 1) {
          const candidate = attempt === 1 ? desiredBase : `${desiredBase}-${attempt}`;
          const mapping = await tx.get(this.firebase.db.collection(ROOT_COLLECTION.apmPublicBranches).doc(candidate));
          if (!mapping.exists) { slug = candidate; break; }
          if (attempt === 100) this.invalid('Benzersiz bir şube bağlantısı üretilemedi.');
        }
      }
      const branch = {
        ...(current ?? { id: ref.id, createdAt: now, createdBy: userId }),
        ...dto,
        slug,
        timeZone: dto.timeZone || 'Europe/Istanbul',
        slotIntervalMinutes: dto.slotIntervalMinutes ?? 15,
        active: dto.active ?? true,
        id: ref.id,
        updatedAt: now,
        updatedBy: userId,
        deletedAt: null,
      };
      tx.set(ref, branch);
      tx.set(this.firebase.db.collection(ROOT_COLLECTION.apmPublicBranches).doc(slug), {
        slug,
        tenantId,
        branchId: ref.id,
        updatedAt: now,
      });
      if (oldSlug && oldSlug !== slug) tx.delete(this.firebase.db.collection(ROOT_COLLECTION.apmPublicBranches).doc(oldSlug));
      return branch as ApmDoc;
    });
  }

  private collection(name: string) {
    return this.firebase.db.collection(tenantCollectionPath(this.tenantContext.getTenantId(), name));
  }

  private ref(collection: string, id: string) { return this.collection(collection).doc(id); }

  private assertDuration(value: number): void {
    if (value % 15 !== 0) this.invalid('Hizmet süresi 15 dakikanın katı olmalı.');
  }

  private invalid(message: string): never { throw new AppException(ErrorCode.APPOINTMENT_INVALID, message); }
  private notFound(): never { throw new AppException(ErrorCode.APPOINTMENT_NOT_FOUND, 'Kayıt bulunamadı.'); }
}

export function slugify(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function safeId(value: string): string { return value.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100); }
export function tokenId(token: string): string { return createHash('sha256').update(token).digest('hex'); }
