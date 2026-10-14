import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { RegisterThrottlerGuard } from '../identity/identity.controller';
import { CreatePublicBookingDto, PublicAvailabilityQueryDto, RequestBookingOtpDto, VerifyBookingOtpDto } from './rentacar.dto';
import { RentacarPublicService } from './rentacar-public.service';

@ApiTags('rentacar-public')
@Controller('public/rentacar/:slug')
export class RentacarPublicController {
  constructor(private readonly service: RentacarPublicService) {}

  @Get('catalog') @ApiOperation({ summary: 'Public branch, vehicle and rate catalog' })
  catalog(@Param('slug') slug: string) { return this.service.catalog(slug); }

  @Get('availability') @ApiOperation({ summary: 'Public vehicle availability' })
  availability(@Param('slug') slug: string, @Query() query: PublicAvailabilityQueryDto) { return this.service.availability(slug, query); }

  @Post('otp/request') @UseGuards(RegisterThrottlerGuard) @Throttle({ default: { limit: 5, ttl: 900_000 } })
  requestOtp(@Param('slug') slug: string, @Body() dto: RequestBookingOtpDto) { return this.service.requestOtp(slug, dto.email); }

  @Post('otp/verify') @UseGuards(RegisterThrottlerGuard) @Throttle({ default: { limit: 10, ttl: 900_000 } })
  verifyOtp(@Param('slug') slug: string, @Body() dto: VerifyBookingOtpDto) { return this.service.verifyOtp(slug, dto.otpId, dto.code); }

  @Post('bookings') @UseGuards(RegisterThrottlerGuard) @Throttle({ default: { limit: 10, ttl: 900_000 } })
  createBooking(@Param('slug') slug: string, @Body() dto: CreatePublicBookingDto) { return this.service.createBooking(slug, dto); }
}
