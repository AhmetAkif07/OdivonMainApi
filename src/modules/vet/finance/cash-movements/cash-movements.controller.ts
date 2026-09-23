import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../../../shared/auth/firebase-auth.guard';
import { RequireModule } from '../../../../shared/authorization/module.decorator';
import { ModuleGuard } from '../../../../shared/authorization/module.guard';
import { RoleGuard } from '../../../../shared/authorization/role.guard';
import { PagingQueryDto } from '../../../../shared/http/paging.dto';
import { TenantGuard } from '../../../../shared/tenancy/tenant.guard';
import { CreateCashMovementDto, UpdateCashMovementDto } from './cash-movement.dto';
import { CashMovementsService } from './cash-movements.service';

@ApiTags('vet-cash-movements')
@ApiBearerAuth()
@RequireModule('vet')
@UseGuards(FirebaseAuthGuard, TenantGuard, ModuleGuard, RoleGuard)
@Controller('vet/cash-movements')
export class CashMovementsController {
  constructor(private readonly service: CashMovementsService) {}

  @Get()
  list(@Query() query: PagingQueryDto) {
    return this.service.list(query);
  }

  @Post()
  create(@Body() dto: CreateCashMovementDto) {
    return this.service.create(dto);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.getById(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCashMovementDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.service.softDelete(id);
    return { id };
  }
}
