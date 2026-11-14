import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';

export class AiChatMessageDto {
  @ApiProperty({ example: 'Yarın öğleden sonra manikür için yer var mı?' })
  @IsString()
  @Length(1, 2000)
  message!: string;

  @ApiPropertyOptional({ description: 'Önceki yanıttaki conversationId; yoksa yeni konuşma açılır' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{8,80}$/)
  conversationId?: string;
}

export class AiTestChatDto extends AiChatMessageDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiPropertyOptional({ description: 'true ise test sohbetinde gerçek randevu oluşturulur' })
  @IsOptional()
  @IsBoolean()
  createBookings?: boolean;
}

export class AiSettingsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ description: 'Salona özel ek talimatlar (kampanya, kurallar, üslup)' })
  @IsOptional()
  @IsString()
  @MaxLength(3000)
  instructions?: string;
}

export class AiWhatsappLinkDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiProperty({ description: 'Meta WhatsApp Cloud API phone_number_id' })
  @IsString()
  @Matches(/^\d{6,30}$/)
  phoneNumberId!: string;

  @ApiPropertyOptional({ example: '+90 532 123 45 67' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  displayPhone?: string;
}

export class AiBranchQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  branchId?: string;
}
