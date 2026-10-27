import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsISO8601,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';
import { FOOD_LABEL_RECORD_KINDS } from './food-label.constants';
import { PartialType } from '@nestjs/swagger';
import { FoodLabelRecordKind, FoodLabelRecordStatus } from './food-label.types';
const STATUSES: readonly FoodLabelRecordStatus[] = [
  'draft',
  'in-review',
  'action-required',
  'approved',
  'rejected',
];
export class CreateFoodLabelRecordDto {
  @IsIn(FOOD_LABEL_RECORD_KINDS) kind!: FoodLabelRecordKind;
  @IsString() @Length(2, 160) name!: string;
  @IsString() @Length(2, 80) location!: string;
  @IsOptional() @IsString() @Length(1, 80) market?: string;
  @IsOptional() @IsString() @Length(1, 80) sku?: string;
  @IsOptional() @IsString() @Length(1, 120) brand?: string;
  @IsOptional() @IsString() @Length(2, 10) locale?: string;
  @IsOptional() @IsString() @Length(1, 80) netQuantity?: string;
  @IsOptional() @IsString() @Length(1, 8000) ingredients?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) allergens?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) claims?: string[];
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100000)
  energyKcal?: number;
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1000)
  proteinG?: number;
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1000)
  carbohydratesG?: number;
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1000)
  fatG?: number;
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @Max(1000)
  saltG?: number;
  @IsOptional() @IsString() @Length(2, 120) responsibleName?: string;
  @IsOptional() @IsISO8601() reviewDueAt?: string;
  @IsOptional() @IsISO8601() approvedAt?: string;
  @IsOptional() @IsString() @Length(0, 4000) notes?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) documentRefs?: string[];
  @IsOptional() @IsIn(STATUSES) status?: FoodLabelRecordStatus;
}
export class UpdateFoodLabelRecordDto extends PartialType(CreateFoodLabelRecordDto) {
  @IsInt() @Min(1) expectedVersion!: number;
}
export class FoodLabelListQueryDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsIn(FOOD_LABEL_RECORD_KINDS) kind?: FoodLabelRecordKind;
  @IsOptional() @IsIn(STATUSES) status?: FoodLabelRecordStatus;
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  archived = false;
  @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() @Min(1) @Max(100) limit = 25;
  @IsOptional() @IsString() cursor?: string;
}
export class CompleteFoodLabelOnboardingDto {
  @IsString() @Length(2, 160) legalName!: string;
  @IsString() @Length(2, 80) productionSite!: string;
  @IsString() @Length(2, 80) country!: string;
  @IsString() @Length(3, 80) timezone!: string;
  @IsString() @Length(2, 120) regulatoryContactName!: string;
  @IsEmail() regulatoryContactEmail!: string;
  @IsOptional() @IsString() @Length(5, 40) regulatoryContactPhone?: string;
  @IsArray() @IsString({ each: true }) targetMarkets!: string[];
}
