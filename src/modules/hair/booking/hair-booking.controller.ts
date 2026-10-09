import { Body, Controller, Get, Injectable, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { ClientThrottlerGuard, clientAddress } from '../../../shared/http/client-throttler.guard';
import {
  PublicBookAppointmentDto,
  PublicSlotsQueryDto,
  PublicStaffQueryDto,
  PublicTokenQueryDto,
} from './booking.dto';
import { HairBookingService } from './hair-booking.service';

/** Rate-limits the public booking API per client IP, also outside production. */
@Injectable()
export class HairBookingThrottlerGuard extends ClientThrottlerGuard {}

/** Public online booking — no auth; the salon is addressed by its branch slug (plan §4.13). */
@ApiTags('hair-public-booking')
@UseGuards(HairBookingThrottlerGuard)
@Throttle({ default: { limit: 120, ttl: 60_000 } })
@Controller('hair/public/booking/:slug')
export class HairBookingController {
  constructor(private readonly booking: HairBookingService) {}

  @Get('info')
  @ApiOperation({ summary: 'Salon / branch info for the booking page' })
  info(@Param('slug') slug: string) {
    return this.booking.info(slug);
  }

  @Get('services')
  @ApiOperation({ summary: 'Online-bookable services of the branch' })
  services(@Param('slug') slug: string) {
    return this.booking.services(slug);
  }

  @Get('staff')
  @ApiOperation({ summary: 'Online-bookable staff who can do all ?serviceIds=a,b' })
  staff(@Param('slug') slug: string, @Query() query: PublicStaffQueryDto) {
    return this.booking.staff(slug, query.serviceIds);
  }

  @Get('slots')
  @ApiOperation({ summary: "Free start times ('HH:mm') on ?date for ?serviceIds (and optional ?staffId)" })
  slots(@Param('slug') slug: string, @Query() query: PublicSlotsQueryDto) {
    return this.booking.slots(slug, query.date, query.serviceIds, query.staffId);
  }

  @Post('appointments')
  @Throttle({ default: { limit: 5, ttl: 600_000 } })
  @ApiOperation({ summary: 'Book online; returns the appointment with its access token' })
  book(@Param('slug') slug: string, @Body() dto: PublicBookAppointmentDto, @Req() request: Request) {
    return this.booking.book(slug, dto, clientAddress(request as unknown as Record<string, unknown>));
  }

  @Get('appointments/:id')
  @ApiOperation({ summary: 'Appointment status (?token= required)' })
  get(@Param('slug') slug: string, @Param('id') id: string, @Query() query: PublicTokenQueryDto) {
    return this.booking.getAppointment(slug, id, query.token);
  }

  @Patch('appointments/:id/cancel')
  @Throttle({ default: { limit: 10, ttl: 600_000 } })
  @ApiOperation({ summary: 'Cancel (?token= required) until cancellationHoursBefore' })
  cancel(@Param('slug') slug: string, @Param('id') id: string, @Query() query: PublicTokenQueryDto) {
    return this.booking.cancel(slug, id, query.token);
  }
}
