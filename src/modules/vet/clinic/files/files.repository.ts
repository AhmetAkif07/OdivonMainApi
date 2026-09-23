import { Injectable } from '@nestjs/common';
import { AuditService } from '../../../../shared/audit/audit.service';
import { AuditAction } from '../../../../shared/audit/audit.types';
import { AppException } from '../../../../shared/errors/app.exception';
import { ErrorCode } from '../../../../shared/errors/error-codes';
import { FirebaseService } from '../../../../shared/firebase/firebase.service';
import { TENANT_COLLECTION, tenantCollectionPath } from '../../../../shared/firebase/firestore-path';
import { createBaseFields, isDeleted, omitUndefined, touchBaseFields } from '../../../../shared/firestore/base-document';
import { TenantContext } from '../../../../shared/tenancy/tenant.context';
import { CreateFileItemDto, UpdateFileItemDto } from './file-item.dto';
import { FileItem } from './file-item.entity';

@Injectable()
export class FilesRepository {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly tenantContext: TenantContext,
    private readonly audit: AuditService,
  ) {}

  private collection() {
    return this.firebase.db.collection(tenantCollectionPath(this.tenantContext.getTenantId(), TENANT_COLLECTION.files));
  }

  async create(dto: CreateFileItemDto): Promise<FileItem> {
    const ref = this.collection().doc();
    const item: FileItem = {
      ...createBaseFields(ref.id, this.tenantContext.getUserId()),
      kind: dto.kind,
      parentId: dto.parentId || null,
      name: dto.name.trim(),
      description: dto.description || null,
      url: dto.kind === 'file' ? (dto.url || '').trim() : null,
    };
    await ref.set(item);
    await this.audit.record({ action: AuditAction.FILE_CREATED, entity: 'files', entityId: item.id });
    return item;
  }

  async findById(id: string): Promise<FileItem | null> {
    const snapshot = await this.collection().doc(id).get();
    if (!snapshot.exists) {
      return null;
    }
    const item = snapshot.data() as FileItem;
    return isDeleted(item) ? null : item;
  }

  async getByIdOrThrow(id: string): Promise<FileItem> {
    const item = await this.findById(id);
    if (!item) {
      throw new AppException(ErrorCode.FILE_NOT_FOUND, 'Dosya veya klasör bulunamadı');
    }
    return item;
  }

  async collect(): Promise<FileItem[]> {
    const snapshot = await this.collection().get();
    return snapshot.docs
      .map((doc) => doc.data() as FileItem)
      .filter((item) => !isDeleted(item))
      .sort((left, right) => {
        if (left.kind !== right.kind) {
          return left.kind === 'folder' ? -1 : 1;
        }
        return left.name.localeCompare(right.name, 'tr') || left.id.localeCompare(right.id);
      });
  }

  async update(id: string, dto: UpdateFileItemDto): Promise<FileItem> {
    const current = await this.getByIdOrThrow(id);
    const kind = dto.kind ?? current.kind;
    const updated: FileItem = {
      ...current,
      ...omitUndefined({
        kind,
        parentId: dto.parentId,
        name: dto.name?.trim(),
        description: dto.description,
        url: kind === 'folder' ? null : dto.url?.trim(),
      }),
      ...touchBaseFields(this.tenantContext.getUserId()),
    };
    await this.collection().doc(id).set(updated);
    await this.audit.record({ action: AuditAction.FILE_UPDATED, entity: 'files', entityId: id });
    return updated;
  }

  async softDelete(id: string): Promise<void> {
    const current = await this.getByIdOrThrow(id);
    await this.collection()
      .doc(id)
      .set({ ...current, deletedAt: new Date().toISOString(), ...touchBaseFields(this.tenantContext.getUserId()) });
    await this.audit.record({ action: AuditAction.FILE_DELETED, entity: 'files', entityId: id });
  }
}
