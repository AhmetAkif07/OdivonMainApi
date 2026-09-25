import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { AppointmentLineDto } from './appointment-line.dto';

export class CompleteAppointmentDto {
  @ApiPropertyOptional({ type: [AppointmentLineDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AppointmentLineDto)
  lines?: AppointmentLineDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  invoiceNo?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  paymentMethodId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cashRegisterId?: string | null;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  discount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remark?: string | null;
}
