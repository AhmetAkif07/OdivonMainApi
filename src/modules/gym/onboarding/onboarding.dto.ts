import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class OnboardingGymDto {
  @IsString()
  name!: string;

  @IsString()
  phone!: string;

  @IsString()
  city!: string;

  @IsString()
  address!: string;

  @IsString()
  openTime!: string;

  @IsString()
  closeTime!: string;

  @IsArray()
  workingDays!: number[];

  @IsOptional()
  @IsString()
  logoUrl?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  features?: string[];
}

export class OnboardingBranchDto {
  @IsString()
  branchName!: string;

  @IsInt()
  @Min(1)
  capacity!: number;

  @IsString()
  branchPhone!: string;

  @IsString()
  branchAddress!: string;
}

export class OnboardingTrainerDto {
  @IsString()
  displayName!: string;

  @IsEmail()
  email!: string;

  @IsString()
  phone!: string;

  @IsOptional()
  @IsString()
  specialties?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CompleteOnboardingDto {
  @ApiProperty()
  @ValidateNested()
  @Type(() => OnboardingGymDto)
  gym!: OnboardingGymDto;

  @ApiProperty()
  @ValidateNested()
  @Type(() => OnboardingBranchDto)
  branch!: OnboardingBranchDto;

  @ApiProperty()
  @ValidateNested()
  @Type(() => OnboardingTrainerDto)
  trainer!: OnboardingTrainerDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  seedDefaultPackages?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  package1Price?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  package3Price?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  package12Price?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  seedWorkoutTemplates?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  seedDisciplines?: boolean;
}
