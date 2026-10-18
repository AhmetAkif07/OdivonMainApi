import { Body, Controller, Delete, Get, Injectable, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { FirebaseAuthGuard } from '../../shared/auth/firebase-auth.guard';
import { ModuleGuard } from '../../shared/authorization/module.guard';
import { RequireModule } from '../../shared/authorization/module.decorator';
import { PermissionGuard } from '../../shared/authorization/permission.guard';
import { RequirePermission } from '../../shared/authorization/require-permission.decorator';
import { ClientThrottlerGuard, clientAddress } from '../../shared/http/client-throttler.guard';
import { TenantGuard } from '../../shared/tenancy/tenant.guard';
import { ApmAppCheckGuard } from './apm-app-check.guard';
import { ApmAvailabilityQueryDto } from './apm-catalog.dto';
import {
  ApmGuestDeviceDto,
  ApmPublicBookDto,
  ApmPublicOtpDto,
  ApmPublicSlotsQueryDto,
  ApmPublicTokenQueryDto,
} from './apm-booking.dto';
import { ApmBookingService } from './apm-booking.service';

@Injectable()
export class ApmBookingThrottlerGuard extends ClientThrottlerGuard {}

@ApiTags('apm-public-booking')
@UseGuards(ApmBookingThrottlerGuard, ApmAppCheckGuard)
@Throttle({ default: { limit: 120, ttl: 60_000 } })
@Controller('apm/public/booking/:slug')
export class ApmBookingController {
  constructor(private readonly booking: ApmBookingService) {}

  @Get('info') info(@Param('slug') slug: string) { return this.booking.info(slug); }
  @Get('services') services(@Param('slug') slug: string) { return this.booking.services(slug); }
  @Get('staff') staff(@Param('slug') slug: string, @Query('serviceId') serviceId?: string) { return this.booking.staff(slug, serviceId); }
  @Get('slots') slots(@Param('slug') slug: string, @Query() query: ApmPublicSlotsQueryDto) { return this.booking.slots(slug, query.date, query.serviceId, query.staffId); }

  @Post('otp')
  @Throttle({ default: { limit: 5, ttl: 600_000 } })
  otp(@Param('slug') slug: string, @Body() dto: ApmPublicOtpDto, @Req() request: Request) {
    return this.booking.requestOtp(slug, dto.email, clientAddress(request as unknown as Record<string, unknown>));
  }

  @Post('appointments')
  @Throttle({ default: { limit: 5, ttl: 600_000 } })
  book(@Param('slug') slug: string, @Body() dto: ApmPublicBookDto, @Req() request: Request) {
    return this.booking.book(slug, dto, clientAddress(request as unknown as Record<string, unknown>));
  }

  @Get('appointments/:id')
  get(@Param('slug') slug: string, @Param('id') id: string, @Query() query: ApmPublicTokenQueryDto) {
    return this.booking.getAppointment(slug, id, query.token);
  }

  @Patch('appointments/:id/cancel')
  cancel(@Param('slug') slug: string, @Param('id') id: string, @Query() query: ApmPublicTokenQueryDto) {
    return this.booking.cancel(slug, id, query.token);
  }

  @Post('appointments/:id/device')
  registerDevice(@Param('slug') slug: string, @Param('id') id: string, @Query() query: ApmPublicTokenQueryDto, @Body() dto: ApmGuestDeviceDto) {
    return this.booking.registerGuestDevice(slug, id, query.token, dto);
  }

  @Delete('appointments/:id/device')
  removeDevice(@Param('slug') slug: string, @Param('id') id: string, @Query() query: ApmPublicTokenQueryDto, @Query('deviceToken') deviceToken: string) {
    return this.booking.removeGuestDevice(slug, id, query.token, deviceToken);
  }
}

@ApiTags('apm-admin')
@ApiBearerAuth()
@RequireModule('apm')
@UseGuards(FirebaseAuthGuard, TenantGuard, ModuleGuard, PermissionGuard)
@Controller('apm')
export class ApmAvailabilityController {
  constructor(private readonly booking: ApmBookingService) {}

  @Get('availability')
  @RequirePermission('apmAppointments', 'view')
  @ApiOperation({ summary: 'Available structured appointment starts for branch, service and optional staff' })
  availability(@Query() query: ApmAvailabilityQueryDto) {
    return this.booking.availability(query.branchId, query.date, query.serviceId, query.staffId);
  }
}
