import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentPlatformAdmin, RequirePlatformAdmin } from '../platform-admin.decorator';
import { PlatformAdminUser } from '../platform-admin.guard';
import { SalesAssistantService } from './sales-assistant.service';
import { SalesConsentService } from './sales-consent.service';
import { SalesReportService } from './sales-report.service';
import { SalesSequencesService } from './sales-sequences.service';
import {
  CreateSalesSequenceDto,
  CreateSalesSuppressionDto,
  EnrollSalesSequenceDto,
  GenerateSalesReportDto,
  LogSalesReplyDto,
  SalesAdCopyDto,
  SalesAiComposeDto,
  SalesCallPrepDto,
  UpdateSalesSequenceDto,
} from './dto';

@ApiTags('platform-sales')
@RequirePlatformAdmin()
@Controller('platform/sales')
export class PlatformSalesAutomationController {
  constructor(
    private readonly assistant: SalesAssistantService,
    private readonly consent: SalesConsentService,
    private readonly sequences: SalesSequencesService,
    private readonly reports: SalesReportService,
  ) {}

  // ---------------------------------------------------------------- AI asistan

  @Get('assistant/status')
  @ApiOperation({ summary: 'AI satış asistanı yapılandırıldı mı (GEMINI_API_KEY ya da ANTHROPIC_API_KEY), sağlayıcı, model' })
  status() {
    return this.assistant.status();
  }

  @Get('assistant/today')
  @ApiOperation({ summary: 'Bugün yapılacaklar: skor ve sıradaki adım önerisiyle lead listesi' })
  today(@Query('product') product?: string, @Query('limit') limit?: string) {
    return this.assistant.today({ product, limit: limit ? Number(limit) : undefined });
  }

  @Get('assistant/leads/:id/score')
  @ApiOperation({ summary: 'Tek lead için skor, etkenler ve sıradaki adım' })
  score(@Param('id') id: string) {
    return this.assistant.score(id);
  }

  @Post('assistant/compose')
  @ApiOperation({ summary: 'AI ile lead\'e özel mesaj taslağı (göndermez)' })
  compose(@Body() dto: SalesAiComposeDto, @CurrentPlatformAdmin() admin: PlatformAdminUser) {
    return this.assistant.compose(dto, admin);
  }

  @Post('assistant/replies')
  @ApiOperation({ summary: 'Gelen cevabı kaydet: AI sınıflandırır, aşama ilerler, cevap taslağı döner' })
  logReply(@Body() dto: LogSalesReplyDto, @CurrentPlatformAdmin() admin: PlatformAdminUser) {
    return this.assistant.logReply(dto, admin);
  }

  @Post('assistant/call-prep')
  @ApiOperation({ summary: 'Arama öncesi AI hazırlığı: açılış, sorular, itirazlar ve cevapları' })
  callPrep(@Body() dto: SalesCallPrepDto, @CurrentPlatformAdmin() admin: PlatformAdminUser) {
    return this.assistant.callPrep(dto, admin);
  }

  @Post('assistant/ad-copy')
  @ApiOperation({ summary: 'AI reklam metni ve kitle önerisi (Meta / Google), lead verisinden' })
  adCopy(@Body() dto: SalesAdCopyDto, @CurrentPlatformAdmin() admin: PlatformAdminUser) {
    return this.assistant.adCopy(dto, admin);
  }

  @Get('forecast')
  @ApiOperation({ summary: '30 günlük yeni abone ve aylık gelir tahmini' })
  forecast(@Query('product') product?: string) {
    return this.assistant.forecast({ product });
  }

  // ---------------------------------------------------------------- haftalık rapor

  @Get('reports')
  @ApiOperation({ summary: 'Son 12 haftalık satış raporu (özet)' })
  listReports() {
    return this.reports.list();
  }

  @Get('reports/:id')
  @ApiOperation({ summary: 'Haftalık rapor ayrıntısı' })
  getReport(@Param('id') id: string) {
    return this.reports.get(id);
  }

  @Post('reports/generate')
  @ApiOperation({ summary: 'Raporu şimdi üret (geçen hafta ya da bu hafta şimdiye kadar)' })
  generateReport(@Body() dto: GenerateSalesReportDto, @CurrentPlatformAdmin() admin: PlatformAdminUser) {
    return this.reports.generate({ week: dto.week ?? 'last' }, admin);
  }

  // ---------------------------------------------------------------- ret listesi

  @Get('suppressions')
  @ApiOperation({ summary: 'Ret (gönderme) listesi' })
  suppressions(@Query('q') q?: string) {
    return this.consent.list(q);
  }

  @Post('suppressions')
  @ApiOperation({ summary: 'Ret listesine e-posta / telefon ekle' })
  addSuppression(@Body() dto: CreateSalesSuppressionDto, @CurrentPlatformAdmin() admin: PlatformAdminUser) {
    return this.consent.add({ value: dto.value, reason: dto.reason ?? 'manual', leadId: dto.leadId ?? null, note: dto.note ?? null, source: 'panel' }, admin);
  }

  @Delete('suppressions/:id')
  @ApiOperation({ summary: 'Ret listesinden çıkar (alıcı yeniden onay verdiyse)' })
  removeSuppression(@Param('id') id: string) {
    return this.consent.remove(id);
  }

  // ---------------------------------------------------------------- diziler

  @Get('sequences')
  @ApiOperation({ summary: 'Otomatik takip dizileri ve kayıt sayıları' })
  listSequences() {
    return this.sequences.list();
  }

  @Post('sequences')
  @ApiOperation({ summary: 'Yeni takip dizisi' })
  createSequence(@Body() dto: CreateSalesSequenceDto, @CurrentPlatformAdmin() admin: PlatformAdminUser) {
    return this.sequences.create(dto, admin);
  }

  @Patch('sequences/:id')
  @ApiOperation({ summary: 'Diziyi güncelle / durdur' })
  updateSequence(@Param('id') id: string, @Body() dto: UpdateSalesSequenceDto, @CurrentPlatformAdmin() admin: PlatformAdminUser) {
    return this.sequences.update(id, dto, admin);
  }

  @Delete('sequences/:id')
  @ApiOperation({ summary: 'Diziyi sil (aktif kayıtlar durur)' })
  deleteSequence(@Param('id') id: string, @CurrentPlatformAdmin() admin: PlatformAdminUser) {
    return this.sequences.remove(id, admin);
  }

  @Post('sequences/:id/enroll')
  @ApiOperation({ summary: 'Lead\'leri diziye ekle (en fazla 200)' })
  enroll(@Param('id') id: string, @Body() dto: EnrollSalesSequenceDto, @CurrentPlatformAdmin() admin: PlatformAdminUser) {
    return this.sequences.enroll(id, dto.leadIds, admin);
  }

  @Get('enrollments')
  @ApiOperation({ summary: 'Dizideki lead\'ler' })
  enrollments(@Query('sequenceId') sequenceId?: string, @Query('leadId') leadId?: string, @Query('status') status?: string) {
    return this.sequences.listEnrollments({ sequenceId, leadId, status });
  }

  @Post('enrollments/:id/stop')
  @ApiOperation({ summary: 'Lead\'i diziden çıkar' })
  stopEnrollment(@Param('id') id: string, @CurrentPlatformAdmin() admin: PlatformAdminUser) {
    return this.sequences.stop(id, admin);
  }

  @Post('sequences/run')
  @ApiOperation({ summary: 'Zamanı gelen adımları şimdi çalıştır (saatlik cron da çalıştırır)' })
  run() {
    return this.sequences.runDue();
  }
}
