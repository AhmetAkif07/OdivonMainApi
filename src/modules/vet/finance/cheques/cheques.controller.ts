import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../../../shared/auth/firebase-auth.guard';
import { RequireModule } from '../../../../shared/authorization/module.decorator';
import { ModuleGuard } from '../../../../shared/authorization/module.guard';
import { PermissionGuard } from '../../../../shared/authorization/permission.guard';
import { RequirePermission } from '../../../../shared/authorization/require-permission.decorator';
import { TenantGuard } from '../../../../shared/tenancy/tenant.guard';
import {
  ChangeChequeStatusDto,
  ChequeQueryDto,
  CreateChequeDto,
  PaymentCalendarQueryDto,
  UpdateChequeDto,
} from './cheque.dto';
import { ChequesService } from './cheques.service';

@ApiTags('vet-cheques')
@ApiBearerAuth()
@RequireModule('vet')
@UseGuards(FirebaseAuthGuard, TenantGuard, ModuleGuard, PermissionGuard)
@Controller('vet/cheques')
export class ChequesController {
  constructor(private readonly service: ChequesService) {}

  @Get()
  @RequirePermission('cheques', 'view')
  list(@Query() query: ChequeQueryDto) {
    return this.service.list(query);
  }

  @Get('calendar')
  @ApiOperation({ summary: 'Payment calendar: open cheques/notes by due day' })
  @RequirePermission('cheques', 'view')
  calendar(@Query() query: PaymentCalendarQueryDto) {
    return this.service.calendar(query);
  }

  @Post()
  @RequirePermission('cheques', 'create')
  create(@Body() dto: CreateChequeDto) {
    return this.service.create(dto);
  }

  @Get(':id')
  @RequirePermission('cheques', 'view')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Patch(':id')
  @RequirePermission('cheques', 'update')
  update(@Param('id') id: string, @Body() dto: UpdateChequeDto) {
    return this.service.update(id, dto);
  }

  @Post(':id/status')
  @ApiOperation({ summary: 'Deposit, endorse, collect, pay, bounce or cancel' })
  @RequirePermission('cheques', 'update')
  changeStatus(@Param('id') id: string, @Body() dto: ChangeChequeStatusDto) {
    return this.service.changeStatus(id, dto);
  }

  @Delete(':id')
  @RequirePermission('cheques', 'delete')
  async remove(@Param('id') id: string) {
    await this.service.remove(id);
    return { id };
  }
}
