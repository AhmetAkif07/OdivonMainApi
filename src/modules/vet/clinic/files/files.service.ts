import { Injectable } from '@nestjs/common';
import { AppException } from '../../../../shared/errors/app.exception';
import { ErrorCode } from '../../../../shared/errors/error-codes';
import { matchesColumnFilters } from '../../../../shared/http/column-filters';
import { paginateInMemory } from '../../../../shared/http/paginate-memory';
import { PagingQueryDto } from '../../../../shared/http/paging.dto';
import { CreateFileItemDto, UpdateFileItemDto } from './file-item.dto';
import { FilesRepository } from './files.repository';

@Injectable()
export class FilesService {
  constructor(private readonly files: FilesRepository) {}

  async create(dto: CreateFileItemDto) {
    this.assertUrl(dto.kind, dto.url);
    await this.assertParent(dto.parentId);
    return this.files.create(dto);
  }

  getById(id: string) {
    return this.files.getByIdOrThrow(id);
  }

  async list(query: PagingQueryDto, parentId?: string | null) {
    const parent = parentId || null;
    const items = (await this.files.collect()).filter((item) => {
      if (item.parentId !== parent) {
        return false;
      }
      return matchesColumnFilters(item, query.filters);
    });
    return paginateInMemory(items, query.limit, query.cursor);
  }

  async update(id: string, dto: UpdateFileItemDto) {
    const current = await this.files.getByIdOrThrow(id);
    const kind = dto.kind ?? current.kind;
    this.assertUrl(kind, dto.url ?? current.url);
    if (dto.parentId !== undefined) {
      if (dto.parentId === id) {
        throw new AppException(ErrorCode.VALIDATION_ERROR, 'Klasör kendisinin altına taşınamaz');
      }
      await this.assertParent(dto.parentId);
    }
    return this.files.update(id, dto);
  }

  async softDelete(id: string) {
    const children = (await this.files.collect()).some((item) => item.parentId === id);
    if (children) {
      throw new AppException(ErrorCode.FILE_IN_USE, 'Klasör boş değil; önce içindeki kayıtları silin');
    }
    return this.files.softDelete(id);
  }

  private assertUrl(kind: string, url?: string | null) {
    if (kind === 'file' && !url?.trim()) {
      throw new AppException(ErrorCode.VALIDATION_ERROR, 'Dosya için bağlantı gerekli');
    }
  }

  private async assertParent(parentId?: string | null) {
    if (!parentId) {
      return;
    }
    const parent = await this.files.getByIdOrThrow(parentId);
    if (parent.kind !== 'folder') {
      throw new AppException(ErrorCode.VALIDATION_ERROR, 'Üst kayıt bir klasör olmalı');
    }
  }
}
