import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { isProductModule } from '../../saas-pricing/saas-pricing.service';
import { CurrentPlatformAdmin, RequirePlatformAdmin } from '../platform-admin.decorator';
import { PlatformAdminUser } from '../platform-admin.guard';
import { PaymentEventsQuery, PaymentSessionsQuery, ResolvePaymentReviewDto, SetPaymentModeDto } from './dto';
import { PlatformPaymentsService } from './platform-payments.service';

@ApiTags('platform-payments')
@RequirePlatformAdmin()
@Controller('platform/payments')
export class PlatformPaymentsController {
  constructor(private readonly payments: PlatformPaymentsService) {}

  @Get('overview')
  @ApiOperation({ summary: 'PayTR/iyzico ayarları, ürün bazında TEST/CANLI mod ve ödeme özetleri' })
  overview(@Query('days') days?: string) {
    return this.payments.overview(days);
  }

  @Get('sessions')
  @ApiOperation({ summary: 'Ödeme oturumları (varsayılan: abonelik ödemeleri, son 30 gün)' })
  sessions(@Query() query: PaymentSessionsQuery) {
    return this.payments.listSessions(query);
  }

  @Get('sessions/:id')
  @ApiOperation({ summary: 'Ödeme oturumu detayı: sipariş, makbuz, inceleme ve hareket logu' })
  session(@Param('id') id: string) {
    return this.payments.sessionDetail(id);
  }

  @Get('events')
  @ApiOperation({ summary: 'Ödeme hareket ve hata logu' })
  events(@Query() query: PaymentEventsQuery) {
    return this.payments.listEvents(query);
  }

  @Get('reviews')
  @ApiOperation({ summary: 'Tahsil edilip uygulanamayan ödemeler (open | resolved | all)' })
  reviews(@Query('status') status?: string) {
    return this.payments.listReviews(status);
  }

  @Post('reviews/:id/resolve')
  @ApiOperation({ summary: 'İnceleme kaydını not ile kapat' })
  resolve(@Param('id') id: string, @Body() dto: ResolvePaymentReviewDto, @CurrentPlatformAdmin() admin: PlatformAdminUser) {
    return this.payments.resolveReview(id, dto.note, admin);
  }

  @Put('modes/:product')
  @ApiOperation({ summary: 'Ürünün PayTR modunu TEST / CANLI yap ya da varsayılana döndür' })
  setMode(@Param('product') product: string, @Body() dto: SetPaymentModeDto, @CurrentPlatformAdmin() admin: PlatformAdminUser) {
    if (!isProductModule(product)) throw new AppException(ErrorCode.VALIDATION_ERROR, `Bilinmeyen ürün: ${product}`);
    return this.payments.setMode(product, dto.mode, dto.reason, admin);
  }
}
