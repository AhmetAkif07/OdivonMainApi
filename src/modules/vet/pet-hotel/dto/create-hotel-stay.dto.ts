import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsIn, IsNumber, IsObject, IsOptional, IsString } from 'class-validator';
import {
  HOTEL_STAY_STATUSES,
  HotelBelongingItem,
  HotelEmergencyContact,
  HotelStayStatus,
} from '../entities/hotel-stay.entity';

export class CreateHotelStayDto {
  @ApiProperty()
  @IsString()
  customerId!: string;

  @ApiProperty()
  @IsString()
  patientId!: string;

  @ApiProperty()
  @IsString()
  roomId!: string;

  @ApiProperty()
  @IsString()
  startDate!: string;

  @ApiProperty()
  @IsString()
  endDate!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  checkInTime?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  checkOutTime?: string;

  @ApiPropertyOptional({ enum: HOTEL_STAY_STATUSES, default: 'reserved' })
  @IsOptional()
  @IsIn(HOTEL_STAY_STATUSES)
  status?: HotelStayStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  dailyRate?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  dietNotes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  medicationNotes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  behaviorNotes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  belongings?: HotelBelongingItem[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  emergencyContact?: HotelEmergencyContact;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  vaccineChecked?: boolean;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsNumber()
  extraServicesAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
