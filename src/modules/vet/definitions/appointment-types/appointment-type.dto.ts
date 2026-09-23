import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsHexColor, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateAppointmentTypeDto {
  @ApiProperty({ example: 'Muayene' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remark?: string | null;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price?: number;

  @ApiPropertyOptional({ example: '#4f46e5' })
  @IsOptional()
  @IsHexColor()
  color?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  taxId?: string | null;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isDefaultPrice?: boolean;
}

export class UpdateAppointmentTypeDto extends PartialType(CreateAppointmentTypeDto) {}
