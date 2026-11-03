import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../../../shared/auth/firebase-auth.guard';
import { RequireModule } from '../../../../shared/authorization/module.decorator';
import { ModuleGuard } from '../../../../shared/authorization/module.guard';
import { PermissionGuard } from '../../../../shared/authorization/permission.guard';
import { RequirePermission } from '../../../../shared/authorization/require-permission.decorator';
import { RoleGuard } from '../../../../shared/authorization/role.guard';
import { TenantGuard } from '../../../../shared/tenancy/tenant.guard';
import { CreateGymBankDto, UpdateGymBankDto } from './gym-bank.dto';
import { GymBankService } from './gym-bank.service';

const Guards = [FirebaseAuthGuard, TenantGuard, ModuleGuard, RoleGuard, PermissionGuard] as const;

@ApiTags('gym-banks')
@ApiBearerAuth()
@RequireModule('gym')
@UseGuards(...Guards)
@Controller('gym/banks')
export class GymBankController {
  constructor(private readonly bankService: GymBankService) {}

  @Get()
  @ApiOperation({ summary: 'Anlaşmalı bankalar ve POS cihazları listesi' })
  @RequirePermission('accounting', 'view')
  list() {
    return this.bankService.list();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Banka detayı' })
  @RequirePermission('accounting', 'view')
  getById(@Param('id') id: string) {
    return this.bankService.getById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Yeni anlaşmalı banka / POS tanımla' })
  @RequirePermission('accounting', 'create')
  create(@Body() dto: CreateGymBankDto) {
    return this.bankService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Banka / POS tanımını güncelle' })
  @RequirePermission('accounting', 'update')
  update(@Param('id') id: string, @Body() dto: UpdateGymBankDto) {
    return this.bankService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Banka tanımını sil' })
  @RequirePermission('accounting', 'delete')
  remove(@Param('id') id: string) {
    return this.bankService.remove(id);
  }
}

