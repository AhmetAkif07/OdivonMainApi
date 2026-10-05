import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString } from 'class-validator';

export class CheckOutHotelStayDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  actualCheckOutAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  extraServicesAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  saleId?: string;
}
