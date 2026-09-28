import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsObject, IsString } from 'class-validator';
import { RequireModule } from '../../../shared/authorization/module.decorator';
import { FarmGuards } from '../shared/farm-guards';
import { FARM_BATCH_LIMIT } from '../shared/farm-store';
import { FarmDataService } from './farm-data.service';

export class FarmBatchCreateDto {
  @ApiProperty({ type: 'array', items: { type: 'object' } })
  @IsArray()
  @ArrayMaxSize(FARM_BATCH_LIMIT)
  @IsObject({ each: true })
  items!: Record<string, unknown>[];
}

export class FarmBatchDeleteDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(FARM_BATCH_LIMIT)
  @IsString({ each: true })
  ids!: string[];
}

/**
 * `/farm/data/{collection}` — the farm collections the OdivonFARM client used to read and write
 * directly in Firestore. Deletes are soft (recycle bin) unless `/permanent` is used.
 */
@ApiTags('farm-data')
@ApiBearerAuth()
@RequireModule('farm')
@UseGuards(...FarmGuards)
@Controller('farm/data/:collection')
export class FarmDataController {
  constructor(private readonly data: FarmDataService) {}

  @Get()
  @ApiOperation({
    summary: 'List active rows (`?deleted=true` for the recycle bin); other query keys filter by equality',
  })
  list(@Param('collection') collection: string, @Query() query: Record<string, unknown>) {
    return this.data.list(collection, query);
  }

  @Get(':id')
  get(@Param('collection') collection: string, @Param('id') id: string) {
    return this.data.get(collection, id);
  }

  @Post()
  create(@Param('collection') collection: string, @Body() body: Record<string, unknown>) {
    return this.data.create(collection, body);
  }

  @Post('batch')
  @ApiOperation({ summary: 'Create many rows in one Firestore batch (e.g. default definitions)' })
  createMany(@Param('collection') collection: string, @Body() dto: FarmBatchCreateDto) {
    return this.data.createMany(collection, dto.items);
  }

  @Post('batch-delete')
  @ApiOperation({ summary: 'Soft-delete many rows in one Firestore batch' })
  softDeleteMany(@Param('collection') collection: string, @Body() dto: FarmBatchDeleteDto) {
    return this.data.softDeleteMany(collection, dto.ids);
  }

  @Patch(':id')
  update(
    @Param('collection') collection: string,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.data.update(collection, id, body);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft delete (moves the row to the recycle bin)' })
  softDelete(@Param('collection') collection: string, @Param('id') id: string) {
    return this.data.softDelete(collection, id);
  }

  @Post(':id/restore')
  restore(@Param('collection') collection: string, @Param('id') id: string) {
    return this.data.restore(collection, id);
  }

  @Delete(':id/permanent')
  hardDelete(@Param('collection') collection: string, @Param('id') id: string) {
    return this.data.hardDelete(collection, id);
  }
}
