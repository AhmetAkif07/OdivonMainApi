import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class AiPatientContextDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  patientId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  patientName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  species?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  breed?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  weight?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  age?: string;

  @ApiPropertyOptional()
  @IsOptional()
  symptoms?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  labResults?: Record<string, number | string>;

  @ApiPropertyOptional()
  @IsOptional()
  currentMeds?: string[];
}

export class AiChatMessageDto {
  @ApiProperty({ enum: ['user', 'assistant'] })
  @IsString()
  role!: 'user' | 'assistant';

  @ApiProperty()
  @IsString()
  content!: string;
}

export class AiChatRequestDto {
  @ApiProperty({ description: 'User message or clinical query' })
  @IsNotEmpty()
  @IsString()
  message!: string;

  @ApiPropertyOptional()
  @IsOptional()
  context?: AiPatientContextDto;

  @ApiPropertyOptional({ type: [AiChatMessageDto] })
  @IsOptional()
  history?: AiChatMessageDto[];
}

export class CalculateDosageDto {
  @ApiProperty({ description: 'Drug name', example: 'Amoxicillin' })
  @IsNotEmpty()
  @IsString()
  drug!: string;

  @ApiProperty({ description: 'Patient weight in kg', example: 4.5 })
  @IsNotEmpty()
  @IsNumber()
  weight!: number;

  @ApiProperty({ description: 'Patient species: kedi, köpek, etc.', example: 'kedi' })
  @IsNotEmpty()
  @IsString()
  species!: string;

  @ApiPropertyOptional({ description: 'Clinical indication or route' })
  @IsOptional()
  @IsString()
  indication?: string;
}
