import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../shared/auth/firebase-auth.guard';
import { EmailVerifiedGuard } from '../../shared/auth/email-verified.guard';
import { RequireModule } from '../../shared/authorization/module.decorator';
import { ModuleGuard } from '../../shared/authorization/module.guard';
import { PermissionGuard } from '../../shared/authorization/permission.guard';
import { RequirePermission } from '../../shared/authorization/require-permission.decorator';
import { TenantGuard } from '../../shared/tenancy/tenant.guard';
import { FOOD_LABEL_ROLE_TEMPLATES } from './food-label.constants';
import { CreateFoodLabelRecordDto, FoodLabelListQueryDto, UpdateFoodLabelRecordDto } from './food-label.dto';
import { FoodLabelService } from './food-label.service';

@ApiTags('food-label')
@ApiBearerAuth()
@RequireModule('food-label')
@UseGuards(FirebaseAuthGuard, TenantGuard, EmailVerifiedGuard, ModuleGuard, PermissionGuard)
@Controller('food-label')
export class FoodLabelController {
  constructor(private readonly service: FoodLabelService) {}
  @Get('roles/templates') @RequirePermission('foodLabelRecords', 'view') roleTemplates() { return FOOD_LABEL_ROLE_TEMPLATES; }
  @Get('records') @RequirePermission('foodLabelRecords', 'view') @ApiOperation({ summary: 'List tenant Gıda etiketi records' }) list(@Query() query: FoodLabelListQueryDto) { return this.service.list(query); }
  @Get('records/:id') @RequirePermission('foodLabelRecords', 'view') get(@Param('id') id: string) { return this.service.get(id); }
  @Post('records') @RequirePermission('foodLabelRecords', 'create') create(@Body() dto: CreateFoodLabelRecordDto) { return this.service.create(dto); }
  @Patch('records/:id') @RequirePermission('foodLabelRecords', 'update') update(@Param('id') id: string, @Body() dto: UpdateFoodLabelRecordDto) { return this.service.update(id, dto); }
  @Delete('records/:id') @RequirePermission('foodLabelRecords', 'delete') archive(@Param('id') id: string) { return this.service.archive(id); }
  @Post('records/:id/restore') @RequirePermission('foodLabelRecords', 'delete') restore(@Param('id') id: string) { return this.service.restore(id); }
}
