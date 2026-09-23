import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateUnitDto {
  @ApiProperty({ example: 'Adet' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({ example: 'ADT' })
  @IsOptional()
  @IsString()
  code?: string | null;
}

export class UpdateUnitDto extends PartialType(CreateUnitDto) {}
