import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { DATE_ID } from '../shared/hair-dto';

export const WAITLIST_STATUSES = ['waiting', 'notified', 'booked', 'cancelled'] as const;

export class CreateHairWaitlistDto {
  @ApiProperty()
  @IsString()
  customerId!: string;

  @ApiProperty()
  @IsString()
  branchId!: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsString({ each: true })
  serviceIds!: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(DATE_ID)
  preferredDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  preferredStaffId?: string;

  @ApiPropertyOptional({ example: 'Öğleden sonra' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  preferredTime?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class UpdateHairWaitlistDto {
  @ApiProperty({ enum: WAITLIST_STATUSES })
  @IsIn(WAITLIST_STATUSES)
  status!: (typeof WAITLIST_STATUSES)[number];
}
