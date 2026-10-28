import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsOptional, IsString, Length, Matches, MaxLength, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;

export class ApmPublicSlotsQueryDto {
  @ApiProperty({ example: '2026-10-19' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string;

  @ApiProperty()
  @IsString()
  serviceId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  staffId?: string;
}

export class ApmPublicOtpDto {
  @ApiProperty()
  @Transform(trim)
  @IsEmail()
  @MaxLength(120)
  email!: string;
}

export class ApmPublicBookDto {
  @ApiProperty()
  @IsString()
  serviceId!: string;

  @ApiPropertyOptional({ description: 'Omitted means any available staff member.' })
  @IsOptional()
  @IsString()
  staffId?: string;

  @ApiProperty({ example: '2026-10-19' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string;

  @ApiProperty({ example: '14:00' })
  @Matches(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
  startTime!: string;

  @ApiProperty()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName!: string;

  @ApiProperty()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  lastName!: string;

  @ApiProperty()
  @Transform(trim)
  @IsString()
  @Length(7, 32)
  phone!: string;

  @ApiProperty()
  @Transform(trim)
  @IsEmail()
  @MaxLength(120)
  email!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @ApiProperty({ description: 'Six digit code sent to email.' })
  @Matches(/^\d{6}$/)
  otpCode!: string;
}

export class ApmPublicTokenQueryDto {
  @ApiProperty()
  @IsString()
  @Length(32, 200)
  token!: string;
}

export class ApmGuestDeviceDto {
  @ApiProperty()
  @IsString()
  @MinLength(20)
  @MaxLength(4096)
  deviceToken!: string;

  @ApiProperty({ enum: ['android', 'ios'] })
  @IsIn(['android', 'ios'])
  platform!: 'android' | 'ios';
}
