import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { PagingQueryDto } from '../../../../shared/http/paging.dto';
import { CONSENT_STATUSES, CONSENT_TYPES, ConsentStatus, ConsentType } from '../entities/consent-form.entity';

export class ListConsentFormsQueryDto extends PagingQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  patientId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiPropertyOptional({ enum: CONSENT_TYPES })
  @IsOptional()
  @IsIn(CONSENT_TYPES)
  type?: ConsentType;

  @ApiPropertyOptional({ enum: CONSENT_STATUSES })
  @IsOptional()
  @IsIn(CONSENT_STATUSES)
  status?: ConsentStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  q?: string;
}
