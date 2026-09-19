import { Injectable } from '@nestjs/common';
import { ProductModule } from '../../shared/authorization/constants';
import { TenantRepository } from './tenant.repository';
import { TenantDocument } from './entities/tenant.entity';

@Injectable()
export class TenantService {
  constructor(private readonly tenants: TenantRepository) {}

  create(input: { name: string; ownerUid: string; modules: ProductModule[] }): Promise<TenantDocument> {
    return this.tenants.create(input);
  }

  getById(id: string): Promise<TenantDocument> {
    return this.tenants.getByIdOrThrow(id);
  }

  hardDelete(id: string): Promise<void> {
    return this.tenants.hardDelete(id);
  }
}
