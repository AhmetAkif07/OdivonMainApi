import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequireModule } from '../../../shared/authorization/module.decorator';
import { RequirePermission } from '../../../shared/authorization/require-permission.decorator';
import { TENANT_COLLECTION } from '../../../shared/firebase/firestore-path';
import { SpaGuards } from '../shared/spa-guards';
import { SpaListQueryDto } from '../shared/spa-list.dto';
import { SpaStore } from '../shared/spa-store';
import {
  CreateSpaPackagePlanDto,
  SellSpaPackageDto,
  UpdateSpaCustomerPackageDto,
  UpdateSpaPackagePlanDto,
} from './package.dto';
import { SpaPackagesService } from './spa-packages.service';

const PLAN_NOT_FOUND = 'Paket planı bulunamadı.';

/** Plans are catalog data (admin-managed); selling them is governed by `spaPackages`. */
@ApiTags('spa-packages')
@ApiBearerAuth()
@RequireModule('spa')
@UseGuards(...SpaGuards)
@Controller('spa/package-plans')
export class SpaPackagePlansController {
  constructor(private readonly store: SpaStore) {}

  @Get()
  @RequirePermission('spaPackages', 'view')
  list() {
    return this.store.list(TENANT_COLLECTION.spaPackagePlans, {
      orderBy: { field: 'ad', dir: 'asc' },
    });
  }

  @Post()
  @RequirePermission('spaCatalog', 'create')
  create(@Body() dto: CreateSpaPackagePlanDto) {
    return this.store.create(TENANT_COLLECTION.spaPackagePlans, 'packagePlans', {
      ...dto,
      active: dto.active ?? true,
    });
  }

  @Patch(':id')
  @RequirePermission('spaCatalog', 'update')
  update(@Param('id') id: string, @Body() dto: UpdateSpaPackagePlanDto) {
    return this.store.update(
      TENANT_COLLECTION.spaPackagePlans,
      'packagePlans',
      id,
      dto,
      PLAN_NOT_FOUND,
    );
  }

  @Delete(':id')
  @RequirePermission('spaCatalog', 'delete')
  remove(@Param('id') id: string) {
    return this.store.softDelete(
      TENANT_COLLECTION.spaPackagePlans,
      'packagePlans',
      id,
      PLAN_NOT_FOUND,
    );
  }
}

@ApiTags('spa-packages')
@ApiBearerAuth()
@RequireModule('spa')
@UseGuards(...SpaGuards)
@Controller('spa/customer-packages')
export class SpaCustomerPackagesController {
  constructor(
    private readonly store: SpaStore,
    private readonly packages: SpaPackagesService,
  ) {}

  @Get()
  @RequirePermission('spaPackages', 'view')
  list(@Query() query: SpaListQueryDto) {
    return this.packages.listCustomerPackages(query);
  }

  @Post('sell')
  @RequirePermission('spaPackages', 'create')
  sell(@Body() dto: SellSpaPackageDto) {
    return this.packages.sell(dto);
  }

  @Patch(':id')
  @RequirePermission('spaPackages', 'update')
  update(@Param('id') id: string, @Body() dto: UpdateSpaCustomerPackageDto) {
    return this.store.update(
      TENANT_COLLECTION.spaCustomerPackages,
      'customerPackages',
      id,
      dto,
      'Paket bulunamadı.',
    );
  }
}
