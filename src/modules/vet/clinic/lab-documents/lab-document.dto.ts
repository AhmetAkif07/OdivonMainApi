import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, IsUrl } from 'class-validator';

export class CreateLabDocumentDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  patientId!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  fileName!: string;

  @ApiProperty()
  @IsUrl({ require_tld: false })
  url!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remark?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  read?: boolean;
}

export class UpdateLabDocumentDto extends PartialType(CreateLabDocumentDto) {}
