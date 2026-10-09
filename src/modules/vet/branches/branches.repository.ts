import { Injectable } from '@nestjs/common';
import { FirebaseService } from '../../../shared/firebase/firebase.service';
import { TENANT_COLLECTION, tenantCollectionPath } from '../../../shared/firebase/firestore-path';
import { createBaseFields, touchBaseFields } from '../../../shared/firestore/base-document';
import { TenantContext } from '../../../shared/tenancy/tenant.context';
import { CreateVetBranchDto, UpdateVetBranchDto } from './branch.dto';
import { VetBranch } from './branch.entity';

@Injectable()
export class BranchesRepository {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly tenantContext: TenantContext,
  ) {}

  private col(tenantId = this.tenantContext.getTenantId()) {
    return this.firebase.db.collection(tenantCollectionPath(tenantId, TENANT_COLLECTION.vetBranches));
  }

  async list(): Promise<VetBranch[]> {
    const snap = await this.col().get();
    return snap.docs
      .map((d) => d.data() as VetBranch)
      .filter((b) => !b.deletedAt)
      .sort((a, b) => (b.isMain ? 1 : 0) - (a.isMain ? 1 : 0));
  }

  async getById(id: string): Promise<VetBranch | null> {
    const snap = await this.col().doc(id).get();
    const data = snap.data() as VetBranch | undefined;
    return data && !data.deletedAt ? data : null;
  }

  async create(dto: CreateVetBranchDto): Promise<VetBranch> {
    const docRef = this.col().doc();
    const userId = this.tenantContext.getUserId();
    const branch: VetBranch = {
      ...createBaseFields(docRef.id, userId),
      name: dto.name.trim(),
      code: dto.code?.trim() || 'SUB-' + Math.floor(100 + Math.random() * 900),
      isMain: Boolean(dto.isMain),
      phone: dto.phone?.trim() || '',
      email: dto.email?.trim() || null,
      address: dto.address?.trim() || '',
      city: dto.city?.trim() || 'İstanbul',
      district: dto.district?.trim() || null,
      managerName: dto.managerName?.trim() || null,
      color: dto.color || '#6366f1',
      status: dto.status || 'active',
    };
    await docRef.set(branch);
    return branch;
  }

  async update(id: string, dto: UpdateVetBranchDto): Promise<VetBranch | null> {
    const current = await this.getById(id);
    if (!current) return null;
    const userId = this.tenantContext.getUserId();
    const patch: Partial<VetBranch> = {
      ...touchBaseFields(userId),
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.code !== undefined ? { code: dto.code.trim() } : {}),
      ...(dto.isMain !== undefined ? { isMain: dto.isMain } : {}),
      ...(dto.phone !== undefined ? { phone: dto.phone.trim() } : {}),
      ...(dto.email !== undefined ? { email: dto.email.trim() || null } : {}),
      ...(dto.address !== undefined ? { address: dto.address.trim() } : {}),
      ...(dto.city !== undefined ? { city: dto.city.trim() } : {}),
      ...(dto.district !== undefined ? { district: dto.district.trim() || null } : {}),
      ...(dto.managerName !== undefined ? { managerName: dto.managerName.trim() || null } : {}),
      ...(dto.color !== undefined ? { color: dto.color } : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
    };
    await this.col().doc(id).update(patch);
    return { ...current, ...patch };
  }

  async delete(id: string): Promise<boolean> {
    const userId = this.tenantContext.getUserId();
    await this.col().doc(id).update({
      deletedAt: new Date().toISOString(),
      deletedBy: userId,
    });
    return true;
  }
}
