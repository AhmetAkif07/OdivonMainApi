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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../shared/auth/firebase-auth.guard';
import { EmailVerifiedGuard } from '../../shared/auth/email-verified.guard';
import { FirebaseAppCheckGuard } from '../../shared/auth/firebase-app-check.guard';
import { RequireModule } from '../../shared/authorization/module.decorator';
import { ModuleGuard } from '../../shared/authorization/module.guard';
import { PermissionGuard } from '../../shared/authorization/permission.guard';
import { RequirePermission } from '../../shared/authorization/require-permission.decorator';
import { TenantGuard } from '../../shared/tenancy/tenant.guard';
import { SubscriptionGuard } from '../../shared/authorization/subscription.guard';
import { FOOD_LABEL_ROLE_TEMPLATES } from './food-label.constants';
import {
  CompleteFoodLabelOnboardingDto,
  CreateFoodLabelRecordDto,
  FoodLabelListQueryDto,
  UpdateFoodLabelRecordDto,
} from './food-label.dto';
import { FoodLabelService } from './food-label.service';

@ApiTags('food-label')
@ApiBearerAuth()
@RequireModule('food-label')
@UseGuards(
  FirebaseAppCheckGuard,
  FirebaseAuthGuard,
  TenantGuard,
  EmailVerifiedGuard,
  SubscriptionGuard,
  ModuleGuard,
  PermissionGuard,
)
@Controller('food-label')
export class FoodLabelController {
  constructor(private readonly service: FoodLabelService) {}
  @Get('roles/templates') @RequirePermission('foodLabelRecords', 'view') roleTemplates() {
    return FOOD_LABEL_ROLE_TEMPLATES;
  }
  @Get('dashboard') @RequirePermission('foodLabelRecords', 'view') dashboard() {
    return this.service.dashboard();
  }
  @Get('audit') @RequirePermission('foodLabelRecords', 'view') allAudit(
    @Query('limit') limit?: string,
  ) {
    return this.service.allAudit(Number(limit) || 100);
  }
  @Get('entitlements') @RequirePermission('foodLabelRecords', 'view') entitlements() {
    return this.service.entitlements();
  }
  @Get('reports/compliance') @RequirePermission('foodLabelRecords', 'export') report() {
    return this.service.complianceReport();
  }
  @Post('onboarding/complete') @RequirePermission('foodLabelRecords', 'update') onboarding(
    @Body() dto: CompleteFoodLabelOnboardingDto,
  ) {
    return this.service.completeOnboarding(dto);
  }
  @Get('records')
  @RequirePermission('foodLabelRecords', 'view')
  @ApiOperation({ summary: 'List tenant Gıda etiketi records' })
  list(@Query() query: FoodLabelListQueryDto) {
    return this.service.list(query);
  }
  @Get('records/:id') @RequirePermission('foodLabelRecords', 'view') get(@Param('id') id: string) {
    return this.service.get(id);
  }
  @Get('records/:id/audit') @RequirePermission('foodLabelRecords', 'view') audit(
    @Param('id') id: string,
  ) {
    return this.service.audit(id);
  }
  @Post('records') @RequirePermission('foodLabelRecords', 'create') create(
    @Body() dto: CreateFoodLabelRecordDto,
  ) {
    return this.service.create(dto);
  }
  @Patch('records/:id') @RequirePermission('foodLabelRecords', 'update') update(
    @Param('id') id: string,
    @Body() dto: UpdateFoodLabelRecordDto,
  ) {
    return this.service.update(id, dto);
  }
  @Delete('records/:id') @RequirePermission('foodLabelRecords', 'delete') archive(
    @Param('id') id: string,
  ) {
    return this.service.archive(id);
  }
  @Post('records/:id/restore') @RequirePermission('foodLabelRecords', 'delete') restore(
    @Param('id') id: string,
  ) {
    return this.service.restore(id);
  }
}
