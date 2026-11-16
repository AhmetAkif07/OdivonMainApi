import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { AI_LEAD_PRODUCTS } from '../ai-research/ai-research.config';
import {
  SALES_ACTIVITY_TYPES,
  SALES_CHANNELS,
  SALES_DELIVERY_MODES,
  SALES_OFFER_KINDS,
  SALES_OFFER_RESPONSE_STATUSES,
  SALES_PRICE_PERIODS,
  SALES_SEND_STEP_SIZE,
  SalesActivityType,
  SalesChannel,
  SalesDeliveryMode,
  SalesOfferKind,
  SalesPricePeriod,
} from './sales.config';

export class SalesPriceDto {
  @IsNumber()
  @Min(0)
  @Max(10_000_000)
  amount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @IsOptional()
  @IsIn(SALES_PRICE_PERIODS)
  period?: SalesPricePeriod;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  discountPercent?: number;
}

export class SalesWhatsappTemplateDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  language?: string;

  /** Şablon gövdesindeki {{1}}, {{2}}… için metinler; yer tutucular ({{isletme}} vb.) lead'e göre doldurulur. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  @ArrayMaxSize(10)
  params?: string[];
}

export class CreateSalesTemplateDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsIn(SALES_CHANNELS)
  channel!: SalesChannel;

  @IsIn(SALES_OFFER_KINDS)
  kind!: SalesOfferKind;

  /** Boş = tüm ürünler için kullanılabilir. */
  @IsOptional()
  @IsIn(AI_LEAD_PRODUCTS)
  product?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  subject?: string;

  @IsString()
  @MaxLength(10_000)
  body!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  ctaUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  ctaLabel?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => SalesPriceDto)
  price?: SalesPriceDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => SalesWhatsappTemplateDto)
  whatsappTemplate?: SalesWhatsappTemplateDto;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateSalesTemplateDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsIn(SALES_CHANNELS) channel?: SalesChannel;
  @IsOptional() @IsIn(SALES_OFFER_KINDS) kind?: SalesOfferKind;
  @IsOptional() @IsIn([...AI_LEAD_PRODUCTS, '']) product?: string | null;
  @IsOptional() @IsString() @MaxLength(200) subject?: string;
  @IsOptional() @IsString() @MaxLength(10_000) body?: string;
  @IsOptional() @IsString() @MaxLength(500) ctaUrl?: string;
  @IsOptional() @IsString() @MaxLength(60) ctaLabel?: string;
  @IsOptional() @ValidateNested() @Type(() => SalesPriceDto) price?: SalesPriceDto | null;
  @IsOptional() @ValidateNested() @Type(() => SalesWhatsappTemplateDto) whatsappTemplate?: SalesWhatsappTemplateDto | null;
  @IsOptional() @IsBoolean() active?: boolean;
}

/** Bir gönderim adımı: en fazla SALES_SEND_STEP_SIZE lead. Panel büyük listeleri parça parça gönderir. */
export class SendSalesOffersDto {
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(SALES_SEND_STEP_SIZE)
  leadIds!: string[];

  @IsIn(SALES_CHANNELS)
  channel!: SalesChannel;

  @IsOptional()
  @IsIn(SALES_OFFER_KINDS)
  kind?: SalesOfferKind;

  /** Şablon seçilirse konu/metin/fiyat şablondan gelir; aşağıdaki alanlar şablonu ezer. */
  @IsOptional()
  @IsString()
  templateId?: string;

  @IsOptional()
  @IsIn(AI_LEAD_PRODUCTS)
  product?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  subject?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  body?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  ctaUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  ctaLabel?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => SalesPriceDto)
  price?: SalesPriceDto;

  @IsOptional()
  @IsISO8601()
  validUntil?: string;

  /** auto = sağlayıcı varsa api, yoksa manuel bağlantı. E-posta her zaman api. */
  @IsOptional()
  @IsIn(['auto', ...SALES_DELIVERY_MODES])
  mode?: 'auto' | SalesDeliveryMode;

  /** Verilirse her lead için N gün sonrasına takip hatırlatması açılır. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(90)
  followUpInDays?: number;

  @IsOptional()
  @IsString()
  mailbox?: string;

  /** Aynı kampanyanın adımlarını gruplamak için (panel üretir). */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  batchId?: string;
}

export class PreviewSalesOfferDto {
  @IsString()
  leadId!: string;

  @IsIn(SALES_CHANNELS)
  channel!: SalesChannel;

  @IsOptional() @IsString() templateId?: string;
  @IsOptional() @IsIn(AI_LEAD_PRODUCTS) product?: string;
  @IsOptional() @IsString() @MaxLength(200) subject?: string;
  @IsOptional() @IsString() @MaxLength(10_000) body?: string;
  @IsOptional() @IsString() @MaxLength(500) ctaUrl?: string;
  @IsOptional() @IsString() @MaxLength(60) ctaLabel?: string;
  @IsOptional() @ValidateNested() @Type(() => SalesPriceDto) price?: SalesPriceDto;
  @IsOptional() @IsISO8601() validUntil?: string;
}

export class UpdateSalesOfferDto {
  @IsOptional()
  @IsIn(SALES_OFFER_RESPONSE_STATUSES)
  status?: (typeof SALES_OFFER_RESPONSE_STATUSES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class CreateSalesActivityDto {
  @IsString()
  leadId!: string;

  @IsIn(SALES_ACTIVITY_TYPES)
  type!: SalesActivityType;

  @IsString()
  @MaxLength(2000)
  text!: string;

  /** followup için zorunlu; diğerlerinde planlanan zaman (ör. toplantı). */
  @IsOptional()
  @IsISO8601()
  dueAt?: string;

  @IsOptional()
  @IsString()
  offerId?: string;
}

export class UpdateSalesActivityDto {
  @IsOptional() @IsString() @MaxLength(2000) text?: string;
  @IsOptional() @IsISO8601() dueAt?: string;
  @IsOptional() @IsBoolean() done?: boolean;
}
