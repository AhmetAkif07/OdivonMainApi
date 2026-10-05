import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { PagingQueryDto } from '../../../../shared/http/paging.dto';
import { HOSPITALIZATION_STATUSES, HospitalizationStatus } from '../entities/hospitalization.entity';

export class ListHospitalizationsQueryDto extends PagingQueryDto {
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
  cageId?: string;

  @ApiPropertyOptional({ enum: HOSPITALIZATION_STATUSES })
  @IsOptional()
  @IsIn(HOSPITALIZATION_STATUSES)
  status?: HospitalizationStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  q?: string;
}
