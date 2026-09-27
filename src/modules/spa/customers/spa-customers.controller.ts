import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequireModule } from '../../../shared/authorization/module.decorator';
import { RequirePermission } from '../../../shared/authorization/require-permission.decorator';
import { TENANT_COLLECTION } from '../../../shared/firebase/firestore-path';
import { SpaGuards } from '../shared/spa-guards';
import { SpaListQueryDto } from '../shared/spa-list.dto';
import { SpaStore } from '../shared/spa-store';
import { CreateSpaCustomerDto, UpdateSpaCustomerDto } from './customer.dto';

const NOT_FOUND = 'Müşteri bulunamadı.';

/** Customers are never deleted — they are deactivated with `active: false`. */
@ApiTags('spa-customers')
@ApiBearerAuth()
@RequireModule('spa')
@UseGuards(...SpaGuards)
@Controller('spa/customers')
export class SpaCustomersController {
  constructor(private readonly store: SpaStore) {}

  @Get()
  @RequirePermission('spaCustomers', 'view')
  list(@Query() query: SpaListQueryDto) {
    return this.store.list(TENANT_COLLECTION.spaCustomers, {
      orderBy: { field: 'createdAt', dir: 'desc' },
      limit: query.limit,
    });
  }

  @Get(':id')
  @RequirePermission('spaCustomers', 'view')
  get(@Param('id') id: string) {
    return this.store.getOrThrow(TENANT_COLLECTION.spaCustomers, id, NOT_FOUND);
  }

  @Post()
  @RequirePermission('spaCustomers', 'create')
  create(@Body() dto: CreateSpaCustomerDto) {
    return this.store.create(TENANT_COLLECTION.spaCustomers, 'customers', {
      ...dto,
      email: dto.email?.trim().toLowerCase(),
      etiketler: dto.etiketler ?? [],
      active: dto.active ?? true,
    });
  }

  @Patch(':id')
  @RequirePermission('spaCustomers', 'update')
  update(@Param('id') id: string, @Body() dto: UpdateSpaCustomerDto) {
    return this.store.update(
      TENANT_COLLECTION.spaCustomers,
      'customers',
      id,
      { ...dto, email: dto.email?.trim().toLowerCase() },
      NOT_FOUND,
    );
  }
}
