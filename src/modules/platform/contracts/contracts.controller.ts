import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentPlatformAdmin, RequirePlatformAdmin } from '../platform-admin.decorator';
import { PlatformAdminUser } from '../platform-admin.guard';
import { PlatformContractsService } from './contracts.service';
import {
  CreateContractDto,
  CreateFromSampleDto,
  ListContractsQueryDto,
  PreviewContractDto,
  UpdateContractDto,
  UpdateContractPartyDto,
} from './dto';

@ApiTags('platform-contracts')
@RequirePlatformAdmin()
@Controller('platform/contracts')
export class PlatformContractsController {
  constructor(private readonly contracts: PlatformContractsService) {}

  @Get('config')
  @ApiOperation({ summary: 'Sözleşme türleri, madde kategorileri, yer tutucular ve örnek madde kütüphanesi' })
  config() {
    return this.contracts.config();
  }

  @Get('products')
  @ApiOperation({ summary: 'Ürün bazında satış sözleşmesi ve yürürlükteki sözleşmeler' })
  products() {
    return this.contracts.products();
  }

  @Get('party')
  @ApiOperation({ summary: 'Sözleşmelerde kullanılan satıcı (Odivon) bilgileri' })
  party() {
    return this.contracts.party();
  }

  @Put('party')
  @ApiOperation({ summary: 'Satıcı bilgilerini güncelle' })
  updateParty(@Body() dto: UpdateContractPartyDto, @CurrentPlatformAdmin() admin: PlatformAdminUser) {
    return this.contracts.updateParty(dto, admin);
  }

  @Get()
  @ApiOperation({ summary: 'Sözleşme listesi (ürün, tür, durum filtreli)' })
  list(@Query() query: ListContractsQueryDto) {
    return this.contracts.list(query);
  }

  @Post()
  @ApiOperation({ summary: 'Yeni sözleşme taslağı' })
  create(@Body() dto: CreateContractDto, @CurrentPlatformAdmin() admin: PlatformAdminUser) {
    return this.contracts.create(dto, admin);
  }

  @Post('from-sample')
  @ApiOperation({ summary: 'Örnek maddelerle (ürüne özel sorumluluk maddeleri dahil) taslak oluştur' })
  createFromSample(@Body() dto: CreateFromSampleDto, @CurrentPlatformAdmin() admin: PlatformAdminUser) {
    return this.contracts.createFromSample(dto, admin);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Sözleşme detayı' })
  detail(@Param('id') id: string) {
    return this.contracts.detail(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Sözleşmeyi güncelle (başlık, maddeler, hukuk onayı...)' })
  update(@Param('id') id: string, @Body() dto: UpdateContractDto, @CurrentPlatformAdmin() admin: PlatformAdminUser) {
    return this.contracts.update(id, dto, admin);
  }

  @Post(':id/preview')
  @ApiOperation({ summary: 'Yer tutucuları doldurulmuş önizleme (isteğe bağlı işletme bilgileriyle)' })
  preview(@Param('id') id: string, @Body() dto: PreviewContractDto) {
    return this.contracts.preview(id, dto);
  }

  @Post(':id/activate')
  @ApiOperation({ summary: 'Yürürlüğe al (aynı ürün ve türdeki önceki sözleşme arşivlenir)' })
  activate(@Param('id') id: string, @CurrentPlatformAdmin() admin: PlatformAdminUser) {
    return this.contracts.activate(id, admin);
  }

  @Post(':id/archive')
  @ApiOperation({ summary: 'Arşivle' })
  archive(@Param('id') id: string, @CurrentPlatformAdmin() admin: PlatformAdminUser) {
    return this.contracts.archive(id, admin);
  }

  @Post(':id/duplicate')
  @ApiOperation({ summary: 'Yeni sürüm taslağı olarak kopyala' })
  duplicate(@Param('id') id: string, @CurrentPlatformAdmin() admin: PlatformAdminUser) {
    return this.contracts.duplicate(id, admin);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Taslak veya arşivdeki sözleşmeyi sil' })
  remove(@Param('id') id: string, @CurrentPlatformAdmin() admin: PlatformAdminUser) {
    return this.contracts.remove(id, admin);
  }
}

/** Ürün uygulamalarının satın alma ekranı için yürürlükteki sözleşme metni (giriş gerektirmez). */
@ApiTags('public-contracts')
@Controller('public/contracts')
export class PublicContractsController {
  constructor(private readonly contracts: PlatformContractsService) {}

  @Get(':product/:kind')
  @ApiOperation({ summary: 'Ürünün yürürlükteki sözleşmesi (ör. /public/contracts/gym/sales)' })
  active(@Param('product') product: string, @Param('kind') kind: string) {
    return this.contracts.activeFor(product, kind);
  }
}
