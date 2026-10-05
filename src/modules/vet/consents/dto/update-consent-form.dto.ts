import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { CONSENT_STATUSES, ConsentStatus } from '../entities/consent-form.entity';

export class UpdateConsentFormDto {
  @ApiPropertyOptional({ enum: CONSENT_STATUSES })
  @IsOptional()
  @IsIn(CONSENT_STATUSES)
  status?: ConsentStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  doctorNotes?: string;
}
