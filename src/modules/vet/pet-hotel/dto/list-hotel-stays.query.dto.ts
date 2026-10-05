import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { PagingQueryDto } from '../../../../shared/http/paging.dto';
import { HOTEL_STAY_STATUSES, HotelStayStatus } from '../entities/hotel-stay.entity';

export class ListHotelStaysQueryDto extends PagingQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  patientId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  roomId?: string;

  @ApiPropertyOptional({ enum: HOTEL_STAY_STATUSES })
  @IsOptional()
  @IsIn(HOTEL_STAY_STATUSES)
  status?: HotelStayStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  endDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  q?: string;
}
