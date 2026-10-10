import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateGymMailTemplateDto {
  @ApiProperty({ description: 'Yeni üye eklendiğinde hoş geldin maili gönderilsin mi' })
  @IsBoolean()
  enabled!: boolean;

  @ApiProperty({ description: 'E-posta konu başlığı' })
  @IsString()
  subject!: string;

  @ApiProperty({ description: 'E-posta içi ana karşılama başlığı' })
  @IsString()
  heading!: string;

  @ApiPropertyOptional({ description: 'Özel kulüp hoş geldin mesajı' })
  @IsOptional()
  @IsString()
  customMessage?: string;

  @ApiProperty({ description: 'Üye kullanıcı adı ve şifre kartı e-postada yer alsın mı' })
  @IsBoolean()
  includeCredentials!: boolean;

  @ApiProperty({ description: 'Mobil turnike QR kod geçiş bilgisi ve rehberi e-postada yer alsın mı' })
  @IsBoolean()
  includeQrCodeInfo!: boolean;

  @ApiPropertyOptional({ description: 'Mobil uygulama veya üye paneli giriş bağlantısı' })
  @IsOptional()
  @IsString()
  mobileAppUrl?: string;
}
