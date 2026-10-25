import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentPlatformAdmin, RequirePlatformAdmin } from '../platform-admin.decorator';
import { PlatformAdminUser } from '../platform-admin.guard';
import { CrmCampaignsService } from './crm-campaigns.service';
import { CrmDirectoryService } from './crm-directory.service';
import { CrmMailService } from './crm-mail.service';
import { CrmNotificationsService } from './crm-notifications.service';
import {
  CreateCampaignDto,
  MailFlagsDto,
  MailListQueryDto,
  MailMessageQueryDto,
  MailMoveDto,
  PreviewAudienceDto,
  SendMailDto,
  SendNotificationDto,
  TestCampaignDto,
  UpdateCampaignDto,
} from './dto';

@ApiTags('platform-crm-mail')
@RequirePlatformAdmin()
@Controller('platform/crm/mail')
export class PlatformCrmMailController {
  constructor(
    private readonly mail: CrmMailService,
    private readonly directory: CrmDirectoryService,
  ) {}

  @Get('status')
  @ApiOperation({ summary: 'Hostinger Mail API bağlantı durumu ve yetkili mail kutuları' })
  status() {
    return this.mail.status();
  }

  @Get('folders')
  folders(@Query('mailbox') mailbox?: string) {
    return this.mail.folders(mailbox);
  }

  @Get('messages')
  @ApiOperation({ summary: 'Klasördeki mailler; gönderen işletmeyle eşleştirilmiş olarak' })
  list(@Query() query: MailListQueryDto) {
    return this.mail.list(query);
  }

  @Get('messages/:uid')
  @ApiOperation({ summary: 'Mail detayı ve içeriği (açınca okundu işaretlenir)' })
  get(@Param('uid', ParseIntPipe) uid: number, @Query() query: MailMessageQueryDto) {
    return this.mail.get(uid, query.folder || 'INBOX', query.mailbox);
  }

  @Patch('messages/:uid/flags')
  flags(@Param('uid', ParseIntPipe) uid: number, @Query() query: MailMessageQueryDto, @Body() dto: MailFlagsDto) {
    return this.mail.setFlags(uid, query.folder || 'INBOX', dto, query.mailbox);
  }

  @Post('messages/:uid/move')
  move(@Param('uid', ParseIntPipe) uid: number, @Query() query: MailMessageQueryDto, @Body() dto: MailMoveDto) {
    return this.mail.move(uid, query.folder || 'INBOX', dto.targetFolder, query.mailbox);
  }

  @Delete('messages/:uid')
  @ApiOperation({ summary: 'Maili çöp kutusuna taşı (çöp kutusundaysa kalıcı sil)' })
  remove(@Param('uid', ParseIntPipe) uid: number, @Query() query: MailMessageQueryDto) {
    return this.mail.remove(uid, query.folder || 'INBOX', query.mailbox);
  }

  @Get('messages/:uid/attachments/:attachmentId')
  async attachment(
    @Param('uid', ParseIntPipe) uid: number,
    @Param('attachmentId') attachmentId: string,
    @Query() query: MailMessageQueryDto,
    @Res() res: Response,
  ) {
    const upstream = await this.mail.attachment(uid, query.folder || 'INBOX', attachmentId, query.mailbox);
    const buffer = Buffer.from(await upstream.arrayBuffer());
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/octet-stream');
    const disposition = upstream.headers.get('content-disposition');
    if (disposition) res.setHeader('Content-Disposition', disposition);
    res.send(buffer);
  }

  @Post('send')
  @ApiOperation({ summary: 'Yeni mail, cevap veya iletme gönder' })
  send(@Body() dto: SendMailDto, @CurrentPlatformAdmin() admin: PlatformAdminUser) {
    return this.mail.send(dto, admin);
  }

  @Get('conversation')
  @ApiOperation({ summary: 'Bir adresle olan tüm yazışmalar (gelen + giden)' })
  conversation(@Query('email') email: string, @Query('mailbox') mailbox?: string) {
    return this.mail.conversation(email ?? '', mailbox);
  }

  @Get('tenants/:tenantId/contacts')
  @ApiOperation({ summary: 'İşletmenin mail atılabilecek personeli' })
  tenantContacts(@Param('tenantId') tenantId: string) {
    return this.directory.tenantContacts(tenantId);
  }
}

@ApiTags('platform-crm-campaigns')
@RequirePlatformAdmin()
@Controller('platform/crm/campaigns')
export class PlatformCrmCampaignsController {
  constructor(private readonly campaigns: CrmCampaignsService) {}

  @Get()
  list() {
    return this.campaigns.list();
  }

  @Post('preview-audience')
  @ApiOperation({ summary: 'Hedef kitle filtresine uyan işletme ve alıcı sayısı' })
  preview(@Body() dto: PreviewAudienceDto) {
    return this.campaigns.previewAudience(dto.audience);
  }

  @Post()
  create(@Body() dto: CreateCampaignDto, @CurrentPlatformAdmin() admin: PlatformAdminUser) {
    return this.campaigns.create(dto, admin);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.campaigns.get(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCampaignDto, @CurrentPlatformAdmin() admin: PlatformAdminUser) {
    return this.campaigns.update(id, dto, admin);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentPlatformAdmin() admin: PlatformAdminUser) {
    return this.campaigns.remove(id, admin);
  }

  @Post(':id/duplicate')
  duplicate(@Param('id') id: string, @CurrentPlatformAdmin() admin: PlatformAdminUser) {
    return this.campaigns.duplicate(id, admin);
  }

  @Post(':id/test')
  @ApiOperation({ summary: 'Kampanyanın örnek bir kopyasını tek adrese gönder' })
  test(@Param('id') id: string, @Body() dto: TestCampaignDto, @CurrentPlatformAdmin() admin: PlatformAdminUser) {
    return this.campaigns.sendTest(id, dto.to, admin);
  }

  @Post(':id/start')
  @ApiOperation({ summary: 'Gönderimi başlat: bildirimleri yazar, mailleri kuyruğa alır' })
  start(@Param('id') id: string, @CurrentPlatformAdmin() admin: PlatformAdminUser) {
    return this.campaigns.start(id, admin);
  }

  @Post(':id/send-step')
  @ApiOperation({ summary: 'Sıradaki mail grubunu gönder; done=true dönene kadar tekrar çağrılır' })
  step(@Param('id') id: string) {
    return this.campaigns.step(id);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string, @CurrentPlatformAdmin() admin: PlatformAdminUser) {
    return this.campaigns.cancel(id, admin);
  }
}

@ApiTags('platform-crm-notifications')
@RequirePlatformAdmin()
@Controller('platform/crm/notifications')
export class PlatformCrmNotificationsController {
  constructor(private readonly notifications: CrmNotificationsService) {}

  @Get()
  list() {
    return this.notifications.listBroadcasts();
  }

  @Post()
  @ApiOperation({ summary: 'Seçilen işletmelerin paneline bildirim gönder (isteğe bağlı mail ile)' })
  send(@Body() dto: SendNotificationDto, @CurrentPlatformAdmin() admin: PlatformAdminUser) {
    return this.notifications.send(dto, admin);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.notifications.getBroadcast(id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Bildirimi tüm işletmelerden geri çek' })
  withdraw(@Param('id') id: string, @CurrentPlatformAdmin() admin: PlatformAdminUser) {
    return this.notifications.withdraw(id, admin);
  }
}
