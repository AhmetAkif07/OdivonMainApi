import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDefined,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { SURVEY_INVITE_STATUSES, SURVEY_QUESTION_TYPES, SurveyInviteStatus, SurveyQuestionType } from './survey.entity';

export class SurveyQuestionDto {
  @ApiPropertyOptional({ description: 'Kept when editing so earlier answers stay linked; generated when empty' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  id!: string;

  @ApiProperty({ enum: SURVEY_QUESTION_TYPES })
  @IsIn(SURVEY_QUESTION_TYPES)
  type!: SurveyQuestionType;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  text!: string;

  @ApiPropertyOptional({ type: [String], description: 'Choice questions only' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  options!: string[];

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  required!: boolean;
}

export class CreateSurveyTemplateDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  thankYouMessage?: string | null;

  @ApiProperty({ type: [SurveyQuestionDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => SurveyQuestionDto)
  questions!: SurveyQuestionDto[];

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateSurveyTemplateDto extends PartialType(CreateSurveyTemplateDto) {}

export class SendSurveyDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  templateId!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  customerId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  patientId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  appointmentId?: string | null;

  @ApiPropertyOptional({ default: 14, minimum: 1, maximum: 90 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  expiresInDays?: number;
}

export class SurveyInviteQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  templateId?: string;

  @ApiPropertyOptional({ enum: SURVEY_INVITE_STATUSES })
  @IsOptional()
  @IsIn(SURVEY_INVITE_STATUSES)
  status?: SurveyInviteStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiPropertyOptional({ description: 'Sent on or after, YYYY-MM-DD' })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({ description: 'Sent on or before, YYYY-MM-DD' })
  @IsOptional()
  @IsISO8601()
  to?: string;
}

export class SurveyAnswerDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  questionId!: string;

  @ApiProperty({ oneOf: [{ type: 'number' }, { type: 'string' }] })
  @IsDefined()
  value!: number | string;
}

export class SubmitSurveyDto {
  @ApiProperty({ type: [SurveyAnswerDto] })
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => SurveyAnswerDto)
  answers!: SurveyAnswerDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string | null;
}
