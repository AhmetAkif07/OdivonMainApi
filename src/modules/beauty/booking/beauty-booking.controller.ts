import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { RequireModule } from '../../../shared/authorization/module.decorator';
import { ClientThrottlerGuard } from '../../../shared/http/client-throttler.guard';
import { BeautyGuards } from '../shared/beauty-guards';
import {
  PublicBookAppointmentDto,
  PublicSlotsQueryDto,
  PublicStaffQueryDto,
  PublicTokenQueryDto,
  SaveBookingLinkDto,
} from './beauty-booking.dto';
import { BeautyBookingService } from './beauty-booking.service';

@ApiTags('beauty-booking-link')
@ApiBearerAuth()
@RequireModule('beauty')
@UseGuards(...BeautyGuards)
@Controller('beauty/booking-link')
export class BeautyBookingLinkController {
  constructor(private readonly service: BeautyBookingService) {}

  @Get()
  @ApiOperation({ summary: 'Şube online randevu linki ve durumunu getirir' })
  getLink(@Query('branchId') branchId?: string) {
    return this.service.getLink(branchId);
  }

  @Post()
  @ApiOperation({ summary: 'Şube online randevu linki oluşturur veya günceller' })
  saveLink(@Body() dto: SaveBookingLinkDto) {
    return this.service.saveLink(dto);
  }
}

@ApiTags('beauty-public-booking')
@UseGuards(ClientThrottlerGuard)
@Throttle({ default: { limit: 120, ttl: 60_000 } })
@Controller('beauty/public/booking/:slug')
export class BeautyPublicBookingController {
  constructor(private readonly service: BeautyBookingService) {}

  @Get('info')
  @ApiOperation({ summary: 'Müşteri randevu sayfası için salon ve şube bilgileri' })
  info(@Param('slug') slug: string) {
    return this.service.info(slug);
  }

  @Get('services')
  @ApiOperation({ summary: 'Online randevuya açık hizmetler' })
  services(@Param('slug') slug: string) {
    return this.service.services(slug);
  }

  @Get('staff')
  @ApiOperation({ summary: 'Hizmeti verebilen online randevuya açık uzmanlar' })
  staff(@Param('slug') slug: string, @Query() query: PublicStaffQueryDto) {
    return this.service.staff(slug, query.serviceId);
  }

  @Get('slots')
  @ApiOperation({ summary: 'Belirtilen tarihte uygun randevu saatleri' })
  slots(@Param('slug') slug: string, @Query() query: PublicSlotsQueryDto) {
    return this.service.slots(slug, query.date, query.serviceId, query.staffId);
  }

  @Post('appointments')
  @Throttle({ default: { limit: 5, ttl: 600_000 } })
  @ApiOperation({ summary: 'Online randevu oluşturur' })
  book(@Param('slug') slug: string, @Body() dto: PublicBookAppointmentDto) {
    return this.service.book(slug, dto);
  }

  @Get('appointments/:id')
  @ApiOperation({ summary: 'Oluşturulan randevu detayını getirir (token zorunlu)' })
  getAppointment(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Query() query: PublicTokenQueryDto,
  ) {
    return this.service.getAppointment(slug, id, query.token);
  }

  @Patch('appointments/:id/cancel')
  @Throttle({ default: { limit: 10, ttl: 600_000 } })
  @ApiOperation({ summary: 'Online randevuyu iptal eder (token zorunlu)' })
  cancel(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Query() query: PublicTokenQueryDto,
  ) {
    return this.service.cancelAppointment(slug, id, query.token);
  }
}
