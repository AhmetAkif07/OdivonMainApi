import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../../../shared/auth/firebase-auth.guard';
import { RequireModule } from '../../../../shared/authorization/module.decorator';
import { ModuleGuard } from '../../../../shared/authorization/module.guard';
import { PermissionGuard } from '../../../../shared/authorization/permission.guard';
import { RequirePermission } from '../../../../shared/authorization/require-permission.decorator';
import { RoleGuard } from '../../../../shared/authorization/role.guard';
import { TenantGuard } from '../../../../shared/tenancy/tenant.guard';
import { GymDailyCloseService } from './daily-close.service';
import { SubmitDailyCloseDto, VerifyDailyCloseDto } from './daily-close.dto';

const Guards = [FirebaseAuthGuard, TenantGuard, ModuleGuard, RoleGuard, PermissionGuard] as const;

@ApiTags('gym-daily-close')
@ApiBearerAuth()
@RequireModule('gym')
@UseGuards(...Guards)
@Controller('gym/daily-close')
export class GymDailyCloseController {
  constructor(private readonly dailyCloseService: GymDailyCloseService) {}

  @Get('preview')
  @ApiOperation({ summary: 'Gün sonu kapanışı öncesi canlı hesaplanan kasa ve tahsilat özeti' })
  @ApiQuery({ name: 'date', required: false, description: 'YYYY-MM-DD formatında tarih (varsayılan: bugün)' })
  @ApiQuery({ name: 'branchId', required: false })
  @RequirePermission('accounting', 'view')
  preview(@Query('date') date?: string, @Query('branchId') branchId?: string) {
    return this.dailyCloseService.getPreClosePreview(date, branchId);
  }

  @Post()
  @ApiOperation({ summary: 'Fiziki sayımı girerek gün sonu Z raporunu kapatır ve mühürler' })
  @RequirePermission('accounting', 'create')
  submit(@Body() dto: SubmitDailyCloseDto, @Req() req: any) {
    const user = req.user ? { id: req.user.id || req.user.sub, name: req.user.name || req.user.email } : undefined;
    return this.dailyCloseService.submitDailyClose(dto, user);
  }

  @Get()
  @ApiOperation({ summary: 'Geçmiş gün sonu kapanış Z raporları listesi' })
  @ApiQuery({ name: 'branchId', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @RequirePermission('accounting', 'view')
  list(@Query('branchId') branchId?: string, @Query('limit') limit?: string) {
    return this.dailyCloseService.listClosings(branchId, limit ? parseInt(limit, 10) : 50);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Tekil Z raporu detayları (yazdırma şablonu verisi)' })
  @RequirePermission('accounting', 'view')
  getById(@Param('id') id: string) {
    return this.dailyCloseService.getClosingById(id);
  }

  @Post(':id/verify')
  @ApiOperation({ summary: 'Müdür/yönetici tarafından Z raporunun incelenip onaylanması' })
  @RequirePermission('accounting', 'update')
  verify(@Param('id') id: string, @Body() _dto: VerifyDailyCloseDto, @Req() req: any) {
    const user = req.user ? { id: req.user.id || req.user.sub, name: req.user.name || req.user.email } : undefined;
    return this.dailyCloseService.verifyClosing(id, user);
  }
}
