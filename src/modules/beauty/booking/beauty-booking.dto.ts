import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

export class SaveBookingLinkDto {
  @ApiProperty({ description: 'Branch ID' })
  @IsString()
  @IsNotEmpty()
  branchId!: string;

  @ApiPropertyOptional({ description: 'Enable or disable online booking for the branch' })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ description: 'Custom slug name' })
  @IsOptional()
  @IsString()
  @Length(3, 50)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'Link adı sadece küçük harf, rakam ve tire içerebilir.',
  })
  slug?: string;

  @ApiPropertyOptional({ description: 'Regenerate a new unique slug' })
  @IsOptional()
  @IsBoolean()
  regenerate?: boolean;
}

export class PublicStaffQueryDto {
  @ApiPropertyOptional({ description: 'Service ID to filter staff who can perform it' })
  @IsOptional()
  @IsString()
  serviceId?: string;
}

export class PublicSlotsQueryDto {
  @ApiProperty({ example: '2026-10-28' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Tarih YYYY-MM-DD formatında olmalıdır.' })
  date!: string;

  @ApiProperty({ description: 'Service ID' })
  @IsString()
  @IsNotEmpty()
  serviceId!: string;

  @ApiPropertyOptional({ description: 'Staff ID' })
  @IsOptional()
  @IsString()
  staffId?: string;
}

export class PublicTokenQueryDto {
  @ApiProperty({ description: 'Access token for managing public appointment' })
  @IsString()
  @Length(16, 200)
  token!: string;
}

export class PublicBookAppointmentDto {
  @ApiProperty({ description: 'Service ID' })
  @IsString()
  @IsNotEmpty()
  serviceId!: string;

  @ApiPropertyOptional({ description: 'Staff ID' })
  @IsOptional()
  @IsString()
  staffId?: string;

  @ApiProperty({ example: '2026-10-28' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string;

  @ApiProperty({ example: '14:00' })
  @IsString()
  @Matches(/^\d{2}:\d{2}$/)
  time!: string;

  @ApiProperty()
  @IsString()
  @Length(2, 80)
  fullName!: string;

  @ApiProperty({ example: '05321234567' })
  @IsString()
  @Length(7, 32)
  phone!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  @MaxLength(120)
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  kvkkConsent!: boolean;
}
