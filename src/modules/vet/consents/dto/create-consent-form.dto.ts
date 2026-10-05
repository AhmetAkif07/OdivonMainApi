import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { CONSENT_TYPES, ConsentType } from '../entities/consent-form.entity';

export class CreateConsentFormDto {
  @ApiProperty({ enum: CONSENT_TYPES })
  @IsIn(CONSENT_TYPES)
  type!: ConsentType;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  customerId!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  customerName!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  customerPhone!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerNationalId?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  patientId!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  patientName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  patientChipNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  procedureName?: string;

  @ApiProperty()
  @IsBoolean()
  riskAcknowledgment!: boolean;

  @ApiProperty()
  @IsBoolean()
  anesthesiaApproval!: boolean;

  @ApiProperty()
  @IsBoolean()
  emergencyInterventionApproval!: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  doctorNotes?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  signatureDataUrl!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  signedAt?: string;
}
