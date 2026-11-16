import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentPlatformAdmin, RequirePlatformAdmin } from '../platform-admin.decorator';
import { PlatformAdminUser } from '../platform-admin.guard';
import { PlatformSalesService, SalesActivityFilters } from './sales.service';
import {
  CreateSalesActivityDto,
  CreateSalesTemplateDto,
  PreviewSalesOfferDto,
  SendSalesOffersDto,
  UpdateSalesActivityDto,
  UpdateSalesOfferDto,
  UpdateSalesTemplateDto,
} from './dto';

@ApiTags('platform-sales')
@RequirePlatformAdmin()
@Controller('platform/sales')
export class PlatformSalesController {
  constructor(private readonly service: PlatformSalesService) {}

  @Get('config')
  @ApiOperation({ summary: 'Kanal durumları (e-posta / WhatsApp / SMS), yer tutucular, sabitler' })
  config() {
    return this.service.config();
  }

  @Get('overview')
  @ApiOperation({ summary: 'Satış panosu: teklif kırılımları, huni, bekleyen takipler' })
  overview(@Query('product') product?: string, @Query('days') days?: string) {
    return this.service.overview({ product, days: days ? Number(days) : undefined });
  }

  @Get('templates')
  @ApiOperation({ summary: 'Teklif / reklam mesaj şablonları' })
  listTemplates() {
    return this.service.listTemplates();
  }

  @Post('templates')
  createTemplate(@Body() dto: CreateSalesTemplateDto, @CurrentPlatformAdmin() admin: PlatformAdminUser) {
    return this.service.createTemplate(dto, admin);
  }

  @Patch('templates/:id')
  updateTemplate(
    @Param('id') id: string,
    @Body() dto: UpdateSalesTemplateDto,
    @CurrentPlatformAdmin() admin: PlatformAdminUser,
  ) {
    return this.service.updateTemplate(id, dto, admin);
  }

  @Delete('templates/:id')
  deleteTemplate(@Param('id') id: string, @CurrentPlatformAdmin() admin: PlatformAdminUser) {
    return this.service.deleteTemplate(id, admin);
  }

  @Post('preview')
  @ApiOperation({ summary: 'Bir lead için mesajın son hâli (gönderilmez)' })
  preview(@Body() dto: PreviewSalesOfferDto) {
    return this.service.preview(dto);
  }

  @Post('offers/send')
  @ApiOperation({ summary: 'Teklif / reklam gönder (adım başına en fazla 20 lead)' })
  send(@Body() dto: SendSalesOffersDto, @CurrentPlatformAdmin() admin: PlatformAdminUser) {
    return this.service.send(dto, admin);
  }

  @Get('offers')
  @ApiOperation({ summary: 'Gönderilen teklifler (filtreli)' })
  listOffers(
    @Query('leadId') leadId?: string,
    @Query('status') status?: string,
    @Query('channel') channel?: string,
    @Query('kind') kind?: string,
    @Query('product') product?: string,
    @Query('batchId') batchId?: string,
    @Query('q') q?: string,
  ) {
    return this.service.listOffers({ leadId, status, channel, kind, product, batchId, q });
  }

  @Get('offers/:id')
  getOffer(@Param('id') id: string) {
    return this.service.getOffer(id);
  }

  @Patch('offers/:id')
  @ApiOperation({ summary: 'Teklif yanıtı: kabul / ret / süresi doldu' })
  updateOffer(@Param('id') id: string, @Body() dto: UpdateSalesOfferDto, @CurrentPlatformAdmin() admin: PlatformAdminUser) {
    return this.service.updateOffer(id, dto, admin);
  }

  @Get('activities')
  @ApiOperation({ summary: 'Notlar, aramalar, toplantılar ve takip hatırlatmaları' })
  listActivities(
    @Query('leadId') leadId?: string,
    @Query('type') type?: string,
    @Query('due') due?: SalesActivityFilters['due'],
  ) {
    return this.service.listActivities({ leadId, type, due });
  }

  @Post('activities')
  createActivity(@Body() dto: CreateSalesActivityDto, @CurrentPlatformAdmin() admin: PlatformAdminUser) {
    return this.service.createActivity(dto, admin);
  }

  @Patch('activities/:id')
  updateActivity(
    @Param('id') id: string,
    @Body() dto: UpdateSalesActivityDto,
    @CurrentPlatformAdmin() admin: PlatformAdminUser,
  ) {
    return this.service.updateActivity(id, dto, admin);
  }

  @Delete('activities/:id')
  deleteActivity(@Param('id') id: string, @CurrentPlatformAdmin() admin: PlatformAdminUser) {
    return this.service.deleteActivity(id, admin);
  }

  @Get('leads/:id/timeline')
  @ApiOperation({ summary: 'Lead zaman çizelgesi: gönderilen teklifler + aktiviteler' })
  leadTimeline(@Param('id') id: string) {
    return this.service.leadTimeline(id);
  }
}
