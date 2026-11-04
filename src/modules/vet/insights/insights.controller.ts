import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Matches, Max, Min } from 'class-validator';
import { FirebaseAuthGuard } from '../../../shared/auth/firebase-auth.guard';
import { RequireModule } from '../../../shared/authorization/module.decorator';
import { ModuleGuard } from '../../../shared/authorization/module.guard';
import { PermissionGuard } from '../../../shared/authorization/permission.guard';
import { RequirePermission } from '../../../shared/authorization/require-permission.decorator';
import { TenantGuard } from '../../../shared/tenancy/tenant.guard';
import { InsightsService } from './insights.service';

export class DayEndQueryDto {
  @ApiPropertyOptional({ description: 'Day to analyse, YYYY-MM-DD (default: today in clinic time)' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date?: string;

  @ApiPropertyOptional({ description: 'Minutes east of UTC (Türkiye = 180)', default: 180 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(-720)
  @Max(840)
  utcOffsetMinutes?: number;
}

@ApiTags('vet-insights')
@ApiBearerAuth()
@RequireModule('vet')
@UseGuards(FirebaseAuthGuard, TenantGuard, ModuleGuard, PermissionGuard)
@Controller('vet/insights')
export class InsightsController {
  constructor(private readonly service: InsightsService) {}

  @Get('day-end')
  @ApiOperation({ summary: 'End-of-day metrics, 7-day comparison and findings with severity' })
  @RequirePermission('reports', 'view')
  dayEnd(@Query() query: DayEndQueryDto) {
    return this.service.dayEnd(query.date, query.utcOffsetMinutes);
  }
}
