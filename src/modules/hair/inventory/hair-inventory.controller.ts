import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequireModule } from '../../../shared/authorization/module.decorator';
import { RequirePermission } from '../../../shared/authorization/require-permission.decorator';
import { HairGuards } from '../shared/hair-guards';
import { HairListQueryDto } from '../shared/hair-list.dto';
import { HairInventoryService } from './hair-inventory.service';
import { CreateInventoryTransactionDto } from './inventory.dto';

@ApiTags('hair-inventory')
@ApiBearerAuth()
@RequireModule('hair')
@UseGuards(...HairGuards)
@Controller('hair/inventory')
export class HairInventoryController {
  constructor(private readonly inventory: HairInventoryService) {}

  @Get('transactions')
  @RequirePermission('hairStock', 'view')
  @ApiOperation({ summary: 'Stock movements, newest first; productId, type, branchId, from/to (YYYY-MM-DD)' })
  transactions(@Query() query: HairListQueryDto) {
    return this.inventory.listTransactions(query);
  }

  @Post('transactions')
  @RequirePermission('hairStock', 'create')
  @ApiOperation({ summary: 'Manual stock in / out / adjustment (reason required)' })
  create(@Body() dto: CreateInventoryTransactionDto) {
    return this.inventory.createTransaction(dto);
  }

  @Get('low-stock')
  @RequirePermission('hairStock', 'view')
  @ApiOperation({ summary: 'Products at or below their minimum stock' })
  lowStock(@Query() query: HairListQueryDto) {
    return this.inventory.lowStock(query);
  }
}
