import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { RequireModule } from '../../../shared/authorization/module.decorator';
import { ClientThrottlerGuard } from '../../../shared/http/client-throttler.guard';
import { BeautyBookingService } from '../booking/beauty-booking.service';
import { BeautyGuards } from '../shared/beauty-guards';
import { BeautyStore } from '../shared/beauty-store';
import {
  AiBranchQueryDto,
  AiChatMessageDto,
  AiSettingsDto,
  AiTestChatDto,
  AiWhatsappLinkDto,
} from './beauty-ai-assistant.dto';
import { BeautyAiAssistantService } from './beauty-ai-assistant.service';
import { BeautyWhatsappService, WaWebhookBody } from './beauty-whatsapp.service';

/** Salon paneli: asistan ayarları, test sohbeti ve WhatsApp numarası. */
@ApiTags('beauty-ai-assistant')
@ApiBearerAuth()
@RequireModule('beauty')
@UseGuards(...BeautyGuards)
@Controller('beauty/ai-assistant')
export class BeautyAiAssistantController {
  constructor(
    private readonly assistant: BeautyAiAssistantService,
    private readonly whatsapp: BeautyWhatsappService,
    private readonly booking: BeautyBookingService,
    private readonly store: BeautyStore,
  ) {}

  private async branch(branchId?: string) {
    const link = await this.booking.getLink(branchId);
    if (!link.branchId) throw new BadRequestException('Önce bir şube oluşturun.');
    return link;
  }

  @Get()
  @ApiOperation({ summary: 'AI asistan durumu, ayarları ve bu ayki kullanım' })
  async status(@Query() query: AiBranchQueryDto) {
    const link = await this.branch(query.branchId);
    const tenantId = this.store.tenantId();
    const [settings, usage, number] = await Promise.all([
      this.assistant.getSettings(tenantId, link.branchId),
      this.assistant.usage(tenantId),
      this.whatsapp.getNumber(tenantId, link.branchId),
    ]);
    return {
      branchId: link.branchId,
      slug: link.slug,
      bookingLinkEnabled: link.enabled,
      aiConfigured: this.assistant.isConfigured(),
      settings,
      usage,
      whatsapp: { configured: this.whatsapp.isConfigured(), number },
    };
  }

  @Patch()
  @ApiOperation({ summary: 'AI asistanı açar/kapatır, salona özel talimatları kaydeder' })
  async saveSettings(@Body() dto: AiSettingsDto) {
    const link = await this.branch(dto.branchId);
    return this.assistant.saveSettings(
      this.store.tenantId(),
      link.branchId,
      { enabled: dto.enabled, instructions: dto.instructions },
      this.store.actor().userId,
    );
  }

  @Post('test-chat')
  @UseGuards(ClientThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Salon sahibinin asistanı denemesi (varsayılan: randevu kaydedilmez)' })
  async testChat(@Body() dto: AiTestChatDto) {
    const link = await this.branch(dto.branchId);
    if (!link.slug) {
      throw new BadRequestException('Asistan online randevu linkini kullanır. Önce Online Randevu ayarından link oluşturun.');
    }
    return this.assistant.chat({
      slug: link.slug,
      channel: 'panel_test',
      message: dto.message,
      conversationId: dto.conversationId,
      dryRun: dto.createBookings !== true,
      ignoreDisabled: true,
    });
  }

  @Put('whatsapp')
  @ApiOperation({ summary: 'Şubeye WhatsApp Cloud API numarası bağlar' })
  async linkWhatsapp(@Body() dto: AiWhatsappLinkDto) {
    const link = await this.branch(dto.branchId);
    return this.whatsapp.linkNumber({
      tenantId: this.store.tenantId(),
      branchId: link.branchId,
      phoneNumberId: dto.phoneNumberId,
      displayPhone: dto.displayPhone,
    });
  }

  @Delete('whatsapp')
  @ApiOperation({ summary: 'Şubenin WhatsApp numarası bağlantısını kaldırır' })
  async unlinkWhatsapp(@Query() query: AiBranchQueryDto) {
    const link = await this.branch(query.branchId);
    return this.whatsapp.unlinkNumber(this.store.tenantId(), link.branchId);
  }
}

/** Müşterinin online randevu sayfasındaki sohbet balonu. */
@ApiTags('beauty-public-booking')
@UseGuards(ClientThrottlerGuard)
@Throttle({ default: { limit: 20, ttl: 60_000 } })
@Controller('beauty/public/booking/:slug/assistant')
export class BeautyPublicAssistantController {
  constructor(private readonly assistant: BeautyAiAssistantService) {}

  @Get()
  @ApiOperation({ summary: 'Salonun AI asistanı açık mı' })
  async status(@Param('slug') slug: string) {
    const { tenantId, branchId } = await this.assistant.resolveSlug(slug);
    const settings = await this.assistant.getSettings(tenantId, branchId);
    return { enabled: settings.enabled && this.assistant.isConfigured() };
  }

  @Post()
  @HttpCode(200)
  @ApiOperation({ summary: 'AI asistana mesaj gönderir; asistan boş saatleri bulup randevu oluşturabilir' })
  chat(@Param('slug') slug: string, @Body() dto: AiChatMessageDto) {
    return this.assistant.chat({
      slug,
      channel: 'web',
      message: dto.message,
      conversationId: dto.conversationId,
    });
  }
}

/** Meta WhatsApp Cloud API webhook'u. */
@ApiTags('beauty-whatsapp')
@Controller('beauty/whatsapp/webhook')
export class BeautyWhatsappWebhookController {
  constructor(private readonly whatsapp: BeautyWhatsappService) {}

  @Get()
  @ApiOperation({ summary: 'Meta webhook doğrulaması (hub.challenge)' })
  verify(@Query() query: Record<string, string>, @Res() res: Response) {
    const challenge = this.whatsapp.verifyWebhook(
      query['hub.mode'],
      query['hub.verify_token'],
      query['hub.challenge'],
    );
    res.status(200).type('text/plain').send(challenge);
  }

  @Post()
  @HttpCode(200)
  @ApiOperation({ summary: 'Gelen WhatsApp mesajları' })
  receive(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('x-hub-signature-256') signature: string | undefined,
    @Body() body: WaWebhookBody,
  ) {
    this.whatsapp.checkSignature(req.rawBody, signature);
    this.whatsapp.handleWebhook(body);
    return { received: true };
  }
}
