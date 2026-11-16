import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import {
  AI_LEAD_PIPELINE_STATUSES,
  AI_LEAD_PRIORITIES,
  AI_LEAD_PRODUCTS,
  AI_RESEARCH_SOURCES,
  AiLeadPipelineStatus,
} from './ai-research.config';

export class CreateAiResearchRunDto {
  @IsString()
  city!: string;

  /** Boşsa şehrin tüm ilçeleri taranır. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(50)
  districts?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(15)
  keywords?: string[];

  @IsOptional()
  @IsArray()
  @IsIn(AI_RESEARCH_SOURCES, { each: true })
  sources?: string[];

  /** Maps sonuç listesinde kaydırma derinliği; yüksek değer = daha çok sonuç, daha uzun süre. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  depth?: number;

  /** Strateji ve mesaj yazılacak öncelikler. */
  @IsOptional()
  @IsArray()
  @IsIn(AI_LEAD_PRIORITIES, { each: true })
  strategyFor?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;
}

export class UpdateAiLeadDto {
  @IsOptional()
  @IsIn(AI_LEAD_PIPELINE_STATUSES)
  status?: AiLeadPipelineStatus;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  /** Ürün kategorisi (Odivon ürün modülleri). Boş liste = "ürün atanmamış". */
  @IsOptional()
  @IsArray()
  @IsIn(AI_LEAD_PRODUCTS, { each: true })
  @ArrayMaxSize(10)
  products?: string[];

  /** Satış ekibinin bulduğu iletişim bilgileri (runner'ın bulduğu telefonun yerine geçmez, önce gelir). */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  contactName?: string;

  /** Boş metin = sil. */
  @IsOptional()
  @ValidateIf((o: UpdateAiLeadDto) => o.email !== '')
  @IsEmail()
  @MaxLength(200)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  whatsapp?: string;
}

export class BulkUpdateAiLeadProductsDto {
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  leadIds!: string[];

  @IsArray()
  @IsIn(AI_LEAD_PRODUCTS, { each: true })
  @ArrayMaxSize(10)
  products!: string[];

  /** set = listeyi değiştir, add = ekle, remove = çıkar. */
  @IsOptional()
  @IsIn(['set', 'add', 'remove'])
  mode?: 'set' | 'add' | 'remove';
}
