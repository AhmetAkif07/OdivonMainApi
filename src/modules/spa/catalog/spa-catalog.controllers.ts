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
  CreateSpaProductDto,
  CreateSpaRoomDto,
  CreateSpaServiceDto,
  CreateStockMovementDto,
  UpdateSpaProductDto,
  UpdateSpaRoomDto,
  UpdateSpaServiceDto,
} from './catalog.dto';
import { SpaCatalogService } from './spa-catalog.service';

const BY_NAME = { field: 'ad', dir: 'asc' } as const;

@ApiTags('spa-catalog')
@ApiBearerAuth()
@RequireModule('spa')
@UseGuards(...SpaGuards)
@Controller('spa/rooms')
export class SpaRoomsController {
  private static readonly NOT_FOUND = 'Oda bulunamadı.';

  constructor(private readonly store: SpaStore) {}

  @Get()
  @RequirePermission('spaCatalog', 'view')
  list() {
    return this.store.list(TENANT_COLLECTION.spaRooms, { orderBy: BY_NAME });
  }

  @Post()
  @RequirePermission('spaCatalog', 'create')
  create(@Body() dto: CreateSpaRoomDto) {
    return this.store.create(TENANT_COLLECTION.spaRooms, 'rooms', {
      ...dto,
      active: dto.active ?? true,
    });
  }

  @Patch(':id')
  @RequirePermission('spaCatalog', 'update')
  update(@Param('id') id: string, @Body() dto: UpdateSpaRoomDto) {
    return this.store.update(
      TENANT_COLLECTION.spaRooms,
      'rooms',
      id,
      dto,
      SpaRoomsController.NOT_FOUND,
    );
  }

  @Delete(':id')
  @RequirePermission('spaCatalog', 'delete')
  remove(@Param('id') id: string) {
    return this.store.softDelete(
      TENANT_COLLECTION.spaRooms,
      'rooms',
      id,
      SpaRoomsController.NOT_FOUND,
    );
  }
}

@ApiTags('spa-catalog')
@ApiBearerAuth()
@RequireModule('spa')
@UseGuards(...SpaGuards)
@Controller('spa/services')
export class SpaServicesController {
  private static readonly NOT_FOUND = 'Hizmet bulunamadı.';

  constructor(private readonly store: SpaStore) {}

  @Get()
  @RequirePermission('spaCatalog', 'view')
  list() {
    return this.store.list(TENANT_COLLECTION.spaServices, { orderBy: BY_NAME });
  }

  @Post()
  @RequirePermission('spaCatalog', 'create')
  create(@Body() dto: CreateSpaServiceDto) {
    return this.store.create(TENANT_COLLECTION.spaServices, 'services', {
      ...dto,
      kategori: dto.kategori ?? dto.tur,
      uygunStaffIds: dto.uygunStaffIds ?? [],
      active: dto.active ?? true,
    });
  }

  @Patch(':id')
  @RequirePermission('spaCatalog', 'update')
  update(@Param('id') id: string, @Body() dto: UpdateSpaServiceDto) {
    return this.store.update(
      TENANT_COLLECTION.spaServices,
      'services',
      id,
      dto,
      SpaServicesController.NOT_FOUND,
    );
  }

  @Delete(':id')
  @RequirePermission('spaCatalog', 'delete')
  remove(@Param('id') id: string) {
    return this.store.softDelete(
      TENANT_COLLECTION.spaServices,
      'services',
      id,
      SpaServicesController.NOT_FOUND,
    );
  }
}

@ApiTags('spa-catalog')
@ApiBearerAuth()
@RequireModule('spa')
@UseGuards(...SpaGuards)
@Controller('spa/products')
export class SpaProductsController {
  private static readonly NOT_FOUND = 'Ürün bulunamadı.';

  constructor(private readonly store: SpaStore) {}

  @Get()
  @RequirePermission('spaCatalog', 'view')
  list() {
    return this.store.list(TENANT_COLLECTION.spaProducts, { orderBy: BY_NAME });
  }

  @Post()
  @RequirePermission('spaCatalog', 'create')
  create(@Body() dto: CreateSpaProductDto) {
    return this.store.create(TENANT_COLLECTION.spaProducts, 'products', {
      ...dto,
      mevcutStok: dto.mevcutStok ?? 0,
      active: dto.active ?? true,
    });
  }

  @Patch(':id')
  @RequirePermission('spaCatalog', 'update')
  update(@Param('id') id: string, @Body() dto: UpdateSpaProductDto) {
    return this.store.update(
      TENANT_COLLECTION.spaProducts,
      'products',
      id,
      dto,
      SpaProductsController.NOT_FOUND,
    );
  }

  @Delete(':id')
  @RequirePermission('spaCatalog', 'delete')
  remove(@Param('id') id: string) {
    return this.store.softDelete(
      TENANT_COLLECTION.spaProducts,
      'products',
      id,
      SpaProductsController.NOT_FOUND,
    );
  }
}

@ApiTags('spa-catalog')
@ApiBearerAuth()
@RequireModule('spa')
@UseGuards(...SpaGuards)
@Controller('spa/stock-movements')
export class SpaStockMovementsController {
  constructor(
    private readonly store: SpaStore,
    private readonly catalog: SpaCatalogService,
  ) {}

  @Get()
  @RequirePermission('spaStock', 'view')
  list(@Query() query: SpaListQueryDto) {
    return this.store.list(TENANT_COLLECTION.spaStockMovements, {
      dateField: 'createdAt',
      from: query.from,
      to: query.to,
      equals: { productId: query.productId },
      orderBy: { field: 'createdAt', dir: 'desc' },
      limit: query.limit,
    });
  }

  @Post()
  @RequirePermission('spaStock', 'create')
  create(@Body() dto: CreateStockMovementDto) {
    return this.catalog.recordStockMovement(dto);
  }
}
