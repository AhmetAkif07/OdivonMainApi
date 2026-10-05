import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNumber, IsOptional, IsString } from 'class-validator';
import { CAGE_STATUSES, CAGE_TYPES, CageStatus, CageType } from '../entities/cage.entity';

export class CreateCageDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty({ enum: CAGE_TYPES })
  @IsIn(CAGE_TYPES)
  type!: CageType;

  @ApiPropertyOptional({ enum: CAGE_STATUSES, default: 'available' })
  @IsOptional()
  @IsIn(CAGE_STATUSES)
  status?: CageStatus;

  @ApiPropertyOptional({ default: 350 })
  @IsOptional()
  @IsNumber()
  dailyRate?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
