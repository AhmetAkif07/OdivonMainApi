import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../../../shared/auth/firebase-auth.guard';
import { RequireModule } from '../../../../shared/authorization/module.decorator';
import { ModuleGuard } from '../../../../shared/authorization/module.guard';
import { PermissionGuard } from '../../../../shared/authorization/permission.guard';
import { RequirePermission } from '../../../../shared/authorization/require-permission.decorator';
import { TenantGuard } from '../../../../shared/tenancy/tenant.guard';
import { AddSupplierBidDto, AwardBidDto, CreateRfqDto, UpdateRfqDto } from './rfq.dto';
import { RfqsService } from './rfqs.service';

@ApiTags('vet-purchasing-rfq')
@ApiBearerAuth()
@RequireModule('vet')
@UseGuards(FirebaseAuthGuard, TenantGuard, ModuleGuard, PermissionGuard)
@Controller('vet/purchasing/rfqs')
export class RfqsController {
  constructor(private readonly service: RfqsService) {}

  @Get()
  @RequirePermission('demands', 'view')
  @ApiOperation({ summary: 'List all RFQ bidding files' })
  list() {
    return this.service.list();
  }

  @Get(':id')
  @RequirePermission('demands', 'view')
  @ApiOperation({ summary: 'Get RFQ detail with side-by-side bids comparison matrix' })
  getById(@Param('id') id: string) {
    return this.service.getById(id);
  }

  @Post()
  @RequirePermission('demands', 'create')
  @ApiOperation({ summary: 'Create new RFQ bid collection request' })
  create(@Body() dto: CreateRfqDto) {
    return this.service.create(dto);
  }

  @Put(':id')
  @RequirePermission('demands', 'update')
  @ApiOperation({ summary: 'Update RFQ details' })
  update(@Param('id') id: string, @Body() dto: UpdateRfqDto) {
    return this.service.update(id, dto);
  }

  @Post(':id/bids')
  @RequirePermission('demands', 'create')
  @ApiOperation({ summary: 'Add supplier bid to RFQ' })
  addBid(@Param('id') id: string, @Body() dto: AddSupplierBidDto) {
    return this.service.addBid(id, dto);
  }

  @Delete(':id/bids/:bidId')
  @RequirePermission('demands', 'delete')
  @ApiOperation({ summary: 'Remove supplier bid from RFQ' })
  removeBid(@Param('id') id: string, @Param('bidId') bidId: string) {
    return this.service.removeBid(id, bidId);
  }

  @Post(':id/award')
  @RequirePermission('demands', 'update')
  @ApiOperation({ summary: 'Select winning bid and submit to approval workflow' })
  awardBid(@Param('id') id: string, @Body() dto: AwardBidDto) {
    return this.service.awardBid(id, dto);
  }

  @Post(':id/create-order')
  @RequirePermission('demands', 'create')
  @ApiOperation({ summary: 'Generate Purchase Order from awarded bid' })
  createOrder(@Param('id') id: string) {
    return this.service.createPurchaseOrderFromRfq(id);
  }

  @Delete(':id')
  @RequirePermission('demands', 'delete')
  @ApiOperation({ summary: 'Delete RFQ' })
  delete(@Param('id') id: string) {
    return this.service.delete(id);
  }
}
