import { Body, Controller, Delete, Get, Headers, Ip, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { RequireModule } from '../../shared/authorization/module.decorator';
import {
  BeautyAppointmentDto,
  BeautyAppointmentStatusDto,
  BeautyAvailabilityDto,
  BeautyListQueryDto,
  BeautyOnboardingDto,
  BeautyPaymentDto,
  BeautyRecommendationDto,
  BeautyRecordDto,
  BeautyRefundDto,
  CompleteBeautySessionDto,
} from './beauty.dto';
import { BeautyService } from './beauty.service';
import { BeautyGuards } from './shared/beauty-guards';
import { AuditMeta } from './shared/beauty-store';

function auditMeta(request: Request, ip: string, userAgent?: string): AuditMeta {
  return { ip, userAgent: userAgent ?? '', requestId: request.header('x-request-id') ?? '' };
}

@ApiTags('beauty-onboarding')
@ApiBearerAuth()
@RequireModule('beauty')
@UseGuards(...BeautyGuards)
@Controller('beauty')
export class BeautyCoreController {
  constructor(private readonly beauty: BeautyService) {}

  @Post('onboarding')
  onboard(@Body() dto: BeautyOnboardingDto, @Req() req: Request, @Ip() ip: string, @Headers('user-agent') ua?: string) {
    return this.beauty.onboard(dto, auditMeta(req, ip, ua));
  }

  @Get('me')
  me(@Req() request: Request & { currentUser?: unknown }) { return request.currentUser; }
}

@ApiTags('beauty-appointments')
@ApiBearerAuth()
@RequireModule('beauty')
@UseGuards(...BeautyGuards)
@Controller('beauty/appointments')
export class BeautyAppointmentsController {
  constructor(private readonly beauty: BeautyService) {}

  @Post('check-availability')
  @ApiOperation({ summary: 'Checks staff, room, device and customer overlap' })
  check(@Body() dto: BeautyAvailabilityDto) { return this.beauty.checkAvailability(dto); }

  @Post()
  create(@Body() dto: BeautyAppointmentDto, @Req() req: Request, @Ip() ip: string, @Headers('user-agent') ua?: string) {
    return this.beauty.createAppointment(dto, auditMeta(req, ip, ua));
  }

  @Patch(':id/status')
  status(@Param('id') id: string, @Body() dto: BeautyAppointmentStatusDto, @Req() req: Request, @Ip() ip: string, @Headers('user-agent') ua?: string) {
    return this.beauty.setAppointmentStatus(id, dto.status, dto.reason, auditMeta(req, ip, ua));
  }

  @Post(':id/complete')
  complete(@Param('id') id: string, @Body() dto: CompleteBeautySessionDto, @Req() req: Request, @Ip() ip: string, @Headers('user-agent') ua?: string) {
    return this.beauty.completeAppointment(id, dto, auditMeta(req, ip, ua));
  }

  @Post(':id/check-in')
  checkIn(@Param('id') id: string, @Req() req: Request, @Ip() ip: string, @Headers('user-agent') ua?: string) {
    return this.beauty.setAppointmentStatus(id, 'checked-in', undefined, auditMeta(req, ip, ua));
  }

  @Post(':id/reschedule')
  reschedule(@Param('id') id: string, @Req() req: Request, @Ip() ip: string, @Headers('user-agent') ua?: string) {
    return this.beauty.setAppointmentStatus(id, 'rescheduled', undefined, auditMeta(req, ip, ua));
  }
}

@ApiTags('beauty-payments')
@ApiBearerAuth()
@RequireModule('beauty')
@UseGuards(...BeautyGuards)
@Controller('beauty/payments')
export class BeautyPaymentsController {
  constructor(private readonly beauty: BeautyService) {}
  @Post()
  create(@Body() dto: BeautyPaymentDto, @Req() req: Request, @Ip() ip: string, @Headers('user-agent') ua?: string) {
    return this.beauty.createPayment(dto, auditMeta(req, ip, ua));
  }
  @Post(':id/refund')
  refund(@Param('id') id: string, @Body() dto: BeautyRefundDto, @Req() req: Request, @Ip() ip: string, @Headers('user-agent') ua?: string) {
    return this.beauty.refundPayment(id, dto, auditMeta(req, ip, ua));
  }
}

@ApiTags('beauty-reports')
@ApiBearerAuth()
@RequireModule('beauty')
@UseGuards(...BeautyGuards)
@Controller('beauty/reports')
export class BeautyReportsController {
  constructor(private readonly beauty: BeautyService) {}
  @Get('dashboard') dashboard(@Query('branchId') branchId?: string) { return this.beauty.dashboard(branchId); }
  @Get(':type') report(@Param('type') type: string, @Query() query: BeautyListQueryDto) {
    return { type, query, status: 'ready', generatedAt: new Date().toISOString() };
  }
}

@ApiTags('beauty-ai')
@ApiBearerAuth()
@RequireModule('beauty')
@UseGuards(...BeautyGuards)
@Controller('beauty/recommendations')
export class BeautyRecommendationsController {
  constructor(private readonly beauty: BeautyService) {}
  @Post('preview') preview(@Body() dto: BeautyRecommendationDto) { return this.beauty.recommendation(dto); }
}

@ApiTags('beauty-resources')
@ApiBearerAuth()
@RequireModule('beauty')
@UseGuards(...BeautyGuards)
@Controller('beauty')
export class BeautyResourcesController {
  constructor(private readonly beauty: BeautyService) {}

  @Get(':resource')
  list(@Param('resource') resource: string, @Query() query: BeautyListQueryDto) { return this.beauty.list(resource, query); }
  @Get(':resource/:id')
  get(@Param('resource') resource: string, @Param('id') id: string) { return this.beauty.get(resource, id); }
  @Post(':resource')
  create(@Param('resource') resource: string, @Body() dto: BeautyRecordDto, @Req() req: Request, @Ip() ip: string, @Headers('user-agent') ua?: string) {
    return this.beauty.create(resource, dto, auditMeta(req, ip, ua));
  }
  @Patch(':resource/:id')
  update(@Param('resource') resource: string, @Param('id') id: string, @Body() dto: BeautyRecordDto, @Req() req: Request, @Ip() ip: string, @Headers('user-agent') ua?: string) {
    return this.beauty.update(resource, id, dto, auditMeta(req, ip, ua));
  }
  @Delete(':resource/:id')
  remove(@Param('resource') resource: string, @Param('id') id: string, @Req() req: Request, @Ip() ip: string, @Headers('user-agent') ua?: string) {
    return this.beauty.remove(resource, id, auditMeta(req, ip, ua));
  }
}
