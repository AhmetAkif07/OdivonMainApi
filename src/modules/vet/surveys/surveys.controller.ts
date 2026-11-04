import { Body, Controller, Delete, Get, Injectable, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { FirebaseAuthGuard } from '../../../shared/auth/firebase-auth.guard';
import { RequireModule } from '../../../shared/authorization/module.decorator';
import { ModuleGuard } from '../../../shared/authorization/module.guard';
import { PermissionGuard } from '../../../shared/authorization/permission.guard';
import { RequirePermission } from '../../../shared/authorization/require-permission.decorator';
import { ClientThrottlerGuard } from '../../../shared/http/client-throttler.guard';
import { TenantGuard } from '../../../shared/tenancy/tenant.guard';
import {
  CreateSurveyTemplateDto,
  SendSurveyDto,
  SubmitSurveyDto,
  SurveyInviteQueryDto,
  UpdateSurveyTemplateDto,
} from './survey.dto';
import { SurveysService } from './surveys.service';

@ApiTags('vet-surveys')
@ApiBearerAuth()
@RequireModule('vet')
@UseGuards(FirebaseAuthGuard, TenantGuard, ModuleGuard, PermissionGuard)
@Controller('vet/surveys')
export class SurveysController {
  constructor(private readonly service: SurveysService) {}

  @Get('templates')
  @RequirePermission('surveys', 'view')
  listTemplates() {
    return this.service.listTemplates();
  }

  @Post('templates')
  @RequirePermission('surveys', 'create')
  createTemplate(@Body() dto: CreateSurveyTemplateDto) {
    return this.service.createTemplate(dto);
  }

  @Get('templates/:id')
  @RequirePermission('surveys', 'view')
  getTemplate(@Param('id') id: string) {
    return this.service.getTemplate(id);
  }

  @Patch('templates/:id')
  @RequirePermission('surveys', 'update')
  updateTemplate(@Param('id') id: string, @Body() dto: UpdateSurveyTemplateDto) {
    return this.service.updateTemplate(id, dto);
  }

  @Delete('templates/:id')
  @RequirePermission('surveys', 'delete')
  async removeTemplate(@Param('id') id: string) {
    await this.service.removeTemplate(id);
    return { id };
  }

  @Get('invites')
  @ApiOperation({ summary: 'Sent surveys and their answers, newest first (max 500)' })
  @RequirePermission('surveys', 'view')
  listInvites(@Query() query: SurveyInviteQueryDto) {
    return this.service.listInvites(query);
  }

  @Post('invites')
  @ApiOperation({ summary: 'Create a survey link for a customer; share /s/{token}' })
  @RequirePermission('surveys', 'create')
  send(@Body() dto: SendSurveyDto) {
    return this.service.send(dto);
  }

  @Get('invites/:id')
  @RequirePermission('surveys', 'view')
  getInvite(@Param('id') id: string) {
    return this.service.getInvite(id);
  }

  @Post('invites/:id/cancel')
  @RequirePermission('surveys', 'update')
  cancelInvite(@Param('id') id: string) {
    return this.service.cancelInvite(id);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Response rate, NPS and per-question averages' })
  @RequirePermission('surveys', 'view')
  summary(@Query() query: SurveyInviteQueryDto) {
    return this.service.summary(query);
  }
}

/** Rate-limits the public survey link per client IP, also outside production. */
@Injectable()
export class PublicSurveyThrottlerGuard extends ClientThrottlerGuard {}

/** Public survey page: no login; the random token in the link is the only key. */
@ApiTags('vet-public-surveys')
@UseGuards(PublicSurveyThrottlerGuard)
@Throttle({ default: { limit: 60, ttl: 60_000 } })
@Controller('public/surveys/:token')
export class PublicSurveysController {
  constructor(private readonly service: SurveysService) {}

  @Get()
  @ApiOperation({ summary: 'Survey questions for the link' })
  view(@Param('token') token: string) {
    return this.service.publicView(token);
  }

  @Post()
  @Throttle({ default: { limit: 10, ttl: 600_000 } })
  @ApiOperation({ summary: 'Submit the answers (once)' })
  submit(@Param('token') token: string, @Body() dto: SubmitSurveyDto) {
    return this.service.submit(token, dto);
  }
}
