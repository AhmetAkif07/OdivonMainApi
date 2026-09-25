import { Injectable } from '@nestjs/common';
import { paginateInMemory } from '../../../shared/http/paginate-memory';
import { CreatePackageDto, ListPackagesQueryDto, UpdatePackageDto } from './package.dto';
import { PackagesRepository } from './packages.repository';

@Injectable()
export class PackagesService {
  constructor(private readonly packages: PackagesRepository) {}

  create(dto: CreatePackageDto) {
    return this.packages.create(dto);
  }

  getById(id: string) {
    return this.packages.getByIdOrThrow(id);
  }

  async list(query: ListPackagesQueryDto) {
    const items = await this.packages.list(query);
    return paginateInMemory(items, query.limit ?? 100, query.cursor);
  }

  update(id: string, dto: UpdatePackageDto) {
    return this.packages.update(id, dto);
  }

  async remove(id: string) {
    await this.packages.softDelete(id);
    return { id };
  }
}
