import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayUnique, IsArray, IsBoolean, IsEmail, IsIn, IsISO8601, IsInt,
  IsNumber, IsObject, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength,
  ValidateIf, ValidateNested,
} from 'class-validator';
import { ReservationStatus, VehicleStatus } from './rentacar.types';

const VEHICLE_STATUSES: VehicleStatus[] = ['available', 'reserved', 'rented', 'maintenance', 'cleaning', 'out_of_service', 'inactive'];
const RESERVATION_STATUSES: ReservationStatus[] = ['draft', 'pending_payment', 'confirmed', 'cancelled', 'no_show', 'converted'];

export class CreateBranchDto {
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(100) name!: string;
  @ApiProperty() @IsString() @Matches(/^[A-Z0-9_-]{2,20}$/i) code!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) address?: string;
  @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean() active?: boolean;
}
export class UpdateBranchDto extends PartialType(CreateBranchDto) {}

export class CreateVehicleDto {
  @ApiProperty() @IsString() branchId!: string;
  @ApiProperty() @IsString() @Matches(/^[A-Z0-9 ÇĞİÖŞÜ-]{3,20}$/i) plate!: string;
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(80) brand!: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(80) model!: string;
  @ApiProperty() @Type(() => Number) @IsInt() @Min(1950) @Max(2100) modelYear!: number;
  @ApiProperty() @IsString() @MaxLength(50) segment!: string;
  @ApiPropertyOptional({ enum: VEHICLE_STATUSES }) @IsOptional() @IsIn(VEHICLE_STATUSES) status?: VehicleStatus;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) mileage?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) fuelType?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) fuelCapacity?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(60) chassisNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(60) engineNumber?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) maintenanceMileage?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) dailyPrice?: number;
}
export class UpdateVehicleDto extends PartialType(CreateVehicleDto) {}

export class CreateCustomerDto {
  @ApiProperty() @IsString() branchId!: string;
  @ApiPropertyOptional({ enum: ['individual', 'company'], default: 'individual' }) @IsOptional() @IsIn(['individual', 'company']) kind?: 'individual' | 'company';
  @ApiProperty() @IsString() @MaxLength(100) firstName!: string;
  @ApiProperty() @IsString() @MaxLength(100) lastName!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(180) companyName?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(/^\d{11}$/) identityNumber?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(/^\d{10}$/) taxNumber?: string;
  @ApiProperty() @IsEmail() email!: string;
  @ApiProperty() @IsString() @MaxLength(30) phone!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) address?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) driverLicenseNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20) driverLicenseClass?: string;
  @ApiPropertyOptional() @IsOptional() @IsISO8601() driverLicenseExpiresAt?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayUnique() @IsString({ each: true }) @ArrayMaxSize(30) tags?: string[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() blacklisted?: boolean;
  @ApiPropertyOptional() @ValidateIf((value: CreateCustomerDto) => value.blacklisted === true) @IsString() @MaxLength(500) blacklistReason?: string;
}
export class UpdateCustomerDto extends PartialType(CreateCustomerDto) {}

export class PriceTierDto {
  @ApiProperty() @Type(() => Number) @IsInt() @Min(1) minDays!: number;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) maxDays?: number | null;
  @ApiProperty() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) dailyPrice!: number;
}

export class CreateRatePlanDto {
  @ApiProperty() @IsString() branchId!: string;
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(100) name!: string;
  @ApiProperty() @IsString() @MaxLength(50) vehicleSegment!: string;
  @ApiPropertyOptional({ default: 20 }) @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100) taxRate?: number;
  @ApiProperty() @IsISO8601() validFrom!: string;
  @ApiProperty() @IsISO8601() validTo!: string;
  @ApiProperty({ type: [PriceTierDto] }) @IsArray() @ArrayMaxSize(30) @ValidateNested({ each: true }) @Type(() => PriceTierDto) tiers!: PriceTierDto[];
  @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean() active?: boolean;
}
export class UpdateRatePlanDto extends PartialType(CreateRatePlanDto) {}

export class QuoteDto {
  @ApiProperty() @IsString() ratePlanId!: string;
  @ApiProperty() @IsISO8601() pickupAt!: string;
  @ApiProperty() @IsISO8601() returnAt!: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) extrasAmount?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) oneWayFee?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100) discountPercent?: number;
}

export class CreateReservationDto extends QuoteDto {
  @ApiProperty() @IsString() branchId!: string;
  @ApiProperty() @IsString() returnBranchId!: string;
  @ApiProperty() @IsString() vehicleId!: string;
  @ApiProperty() @IsString() customerId!: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayUnique() @IsString({ each: true }) extraIds?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) note?: string;
  @ApiPropertyOptional({ enum: RESERVATION_STATUSES }) @IsOptional() @IsIn(['draft', 'pending_payment', 'confirmed']) status?: ReservationStatus;
}

export class RescheduleReservationDto extends QuoteDto {
  @ApiPropertyOptional() @IsOptional() @IsString() vehicleId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() branchId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() returnBranchId?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayUnique() @IsString({ each: true }) extraIds?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) note?: string;
  @ApiProperty() @Type(() => Number) @IsInt() @Min(1) version!: number;
}

export class ReservationStatusDto {
  @ApiProperty({ enum: RESERVATION_STATUSES }) @IsIn(RESERVATION_STATUSES) status!: ReservationStatus;
  @ApiProperty() @Type(() => Number) @IsInt() @Min(1) version!: number;
}

export class CheckoutRentalDto {
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) mileage?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100) fuelPercent?: number;
}

export class ReturnRentalDto extends CheckoutRentalDto {
  @ApiPropertyOptional({ enum: ['cleaning', 'maintenance', 'available'], default: 'cleaning' })
  @IsOptional() @IsIn(['cleaning', 'maintenance', 'available']) nextVehicleStatus?: VehicleStatus;
}

export class CreateTransactionDto {
  @ApiProperty() @IsString() branchId!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() customerId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() reservationId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() rentalId?: string;
  @ApiProperty({ enum: ['charge', 'payment', 'deposit', 'adjustment'] }) @IsIn(['charge', 'payment', 'deposit', 'adjustment']) kind!: 'charge' | 'payment' | 'deposit' | 'adjustment';
  @ApiProperty({ enum: ['cash', 'pos', 'bank_transfer', 'online'] }) @IsIn(['cash', 'pos', 'bank_transfer', 'online']) method!: 'cash' | 'pos' | 'bank_transfer' | 'online';
  @ApiProperty() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) amount!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class RefundTransactionDto {
  @ApiProperty() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) amount!: number;
  @ApiProperty() @IsString() @MinLength(3) @MaxLength(500) reason!: string;
}

export class CreateRelatedRecordDto {
  @ApiProperty() @IsString() branchId!: string;
  @ApiProperty() @IsObject() data!: Record<string, unknown>;
}

export class UpdateRelatedRecordDto {
  @ApiProperty() @IsObject() data!: Record<string, unknown>;
}

export class ListRentQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() branchId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) search?: string;
  @ApiPropertyOptional({ default: 100 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) limit?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) pageSize?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() status?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() vehicleId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() customerId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() reservationId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() rentalId?: string;
}

export class ScheduleQueryDto {
  @ApiProperty() @IsISO8601() from!: string;
  @ApiProperty() @IsISO8601() to!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() branchId?: string;
}

export class RentSettingsDto {
  @ApiProperty() @IsString() @Matches(/^[a-z0-9-]{3,60}$/) publicSlug!: string;
  @ApiPropertyOptional({ default: false }) @IsOptional() @IsBoolean() publicBookingEnabled?: boolean;
  @ApiPropertyOptional({ default: 20 }) @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100) depositPercent?: number;
  @ApiPropertyOptional({ default: 20 }) @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100) defaultTaxRate?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(10000) privacyNotice?: string;
}

export class PublicAvailabilityQueryDto {
  @ApiProperty() @IsString() branchId!: string;
  @ApiProperty() @IsISO8601() pickupAt!: string;
  @ApiProperty() @IsISO8601() returnAt!: string;
}

export class RequestBookingOtpDto {
  @ApiProperty() @IsEmail() email!: string;
}

export class VerifyBookingOtpDto {
  @ApiProperty() @IsString() otpId!: string;
  @ApiProperty() @Matches(/^\d{6}$/) code!: string;
}

export class PublicBookingCustomerDto {
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(100) firstName!: string;
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(100) lastName!: string;
  @ApiProperty() @IsEmail() email!: string;
  @ApiProperty() @IsString() @MaxLength(30) phone!: string;
  @ApiPropertyOptional() @IsOptional() @Matches(/^\d{11}$/) identityNumber?: string;
}

export class CreatePublicBookingDto extends QuoteDto {
  @ApiProperty() @IsString() verificationId!: string;
  @ApiProperty() @IsString() verificationToken!: string;
  @ApiProperty() @IsString() branchId!: string;
  @ApiProperty() @IsString() returnBranchId!: string;
  @ApiProperty() @IsString() vehicleId!: string;
  @ApiProperty({ type: PublicBookingCustomerDto }) @ValidateNested() @Type(() => PublicBookingCustomerDto) customer!: PublicBookingCustomerDto;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayUnique() @IsString({ each: true }) extraIds?: string[];
  @ApiProperty() @IsBoolean() privacyAccepted!: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() marketingAccepted?: boolean;
}
