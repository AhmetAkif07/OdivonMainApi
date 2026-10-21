import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class BeautyListQueryDto {
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsISO8601() from?: string;
  @IsOptional() @IsISO8601() to?: string;
  @IsOptional() @IsString() cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit = 50;
}

export class BeautyRecordDto {
  @IsObject() data!: Record<string, unknown>;
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsString() idempotencyKey?: string;
}

export class BeautyAppointmentDto {
  @IsString() branchId!: string;
  @IsString() customerId!: string;
  @IsString() staffId!: string;
  @IsOptional() @IsString() roomId?: string;
  @IsOptional() @IsString() deviceId?: string;
  @IsArray() @IsString({ each: true }) serviceIds!: string[];
  @IsOptional() @IsString() customerPackageId?: string;
  @IsISO8601() startAt!: string;
  @IsISO8601() endAt!: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() source?: string;
  @IsOptional() @IsString() idempotencyKey?: string;
}

export class BeautyAvailabilityDto {
  @IsString() branchId!: string;
  @IsString() customerId!: string;
  @IsString() staffId!: string;
  @IsOptional() @IsString() roomId?: string;
  @IsOptional() @IsString() deviceId?: string;
  @IsISO8601() startAt!: string;
  @IsISO8601() endAt!: string;
}

export class BeautyAppointmentStatusDto {
  @IsIn([
    'pending',
    'confirmed',
    'checked-in',
    'in-progress',
    'completed',
    'cancelled',
    'no-show',
    'rescheduled',
  ])
  status!: string;
  @IsOptional() @IsString() reason?: string;
}

export class ConsumedProductDto {
  @IsString() productId!: string;
  @IsNumber() @Min(0.001) quantity!: number;
}

export class CompleteBeautySessionDto {
  @IsOptional() @IsString() customerPackageId?: string;
  @IsOptional() @IsString() deviceId?: string;
  @IsOptional() @IsString() bodyZone?: string;
  @IsOptional() @IsNumber() energyJcm2?: number;
  @IsOptional() @IsNumber() pulseDurationMs?: number;
  @IsOptional() @IsNumber() coolingTempC?: number;
  @IsInt() @Min(1) durationMin!: number;
  @IsOptional() @IsString() reaction?: string;
  @IsOptional() @IsString() notes?: string;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConsumedProductDto)
  products: ConsumedProductDto[] = [];
  @IsOptional() @IsString() idempotencyKey?: string;
}

export class BeautyPaymentDto {
  @IsString() branchId!: string;
  @IsString() customerId!: string;
  @IsNumber() @Min(0.01) amount!: number;
  @IsIn(['cash', 'card', 'transfer', 'online', 'wallet', 'loyalty']) method!: string;
  @IsOptional() @IsNumber() @Min(0) tip?: number;
  @IsOptional() @IsString() appointmentId?: string;
  @IsOptional() @IsString() customerPackageId?: string;
  @IsOptional() @IsString() staffId?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(100) commissionRate?: number;
  @IsOptional() @IsString() idempotencyKey?: string;
}

export class BeautyRefundDto {
  @IsNumber() @Min(0.01) amount!: number;
  @IsString() reason!: string;
  @IsOptional() @IsBoolean() returnStock = false;
  @IsOptional() @IsString() idempotencyKey?: string;
}

export class BeautyRecommendationDto {
  @IsString() customerId!: string;
  @IsString() goal!: string;
  @IsString() skinType!: string;
  @IsOptional() @IsString() notes?: string;
}

export class BeautyOnboardingDto {
  @IsString() businessName!: string;
  @IsString() branchName!: string;
  @IsOptional() @IsString() timezone = 'Europe/Istanbul';
}

export class BeautyMobileConnectDto {
  @IsString() centerCode!: string;
}

export class BeautyConsultationDto {
  @IsOptional() @IsString() customerId?: string;
  @IsString() customerName!: string;
  @IsString() phone!: string;
  @IsOptional() @IsString() email?: string;
  @IsString() serviceCategory!: string;
  @IsString() inquiredSession!: string;
  @IsOptional() @IsNumber() @Min(1) targetSessionsCount?: number;
  @IsOptional() @IsNumber() @Min(0) quotedPrice?: number;
  @IsOptional() @IsString() consultantStaffId?: string;
  @IsOptional() @IsString() consultantStaffName?: string;
  @IsOptional() @IsString() consultationDate?: string;
  @IsOptional() @IsString() nextFollowUpDate?: string;
  @IsOptional() @IsIn(['high', 'medium', 'low']) interestLevel?: string;
  @IsOptional() @IsString() channel?: string;
  @IsOptional() @IsIn(['inquiry', 'scheduled', 'converted', 'cancelled']) status?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() branchId?: string;
}

export class BeautyCustomerHealthDto {
  @IsOptional() @IsString() customerId?: string;
  @IsOptional() @IsString() skinType?: string;
  @IsOptional() @IsString() fitzpatrick?: string;
  @IsOptional() @IsString() allergies?: string;
  @IsOptional() @IsString() chronicDiseases?: string;
  @IsOptional() @IsString() medications?: string;
  @IsOptional() @IsBoolean() isPregnant?: boolean;
  @IsOptional() @IsBoolean() isNursing?: boolean;
  @IsOptional() @IsBoolean() hasImplant?: boolean;
  @IsOptional() @IsString() bloodType?: string;
  @IsOptional() @IsString() healthNotes?: string;
  @IsOptional() @IsString() lastUpdated?: string;
  @IsOptional() @IsString() branchId?: string;
}

export class BeautyWalletTransactionDto {
  @IsString() customerId!: string;
  @IsOptional() @IsString() branchId?: string;
  @IsISO8601() date!: string;
  @IsIn(['deposit', 'spend', 'refund']) type!: string;
  @IsNumber() amount!: number;
  @IsString() description!: string;
  @IsString() paymentMethod!: string;
}

export class BeautyInstallmentPlanDto {
  @IsString() customerId!: string;
  @IsOptional() @IsString() branchId?: string;
  @IsString() title!: string;
  @IsNumber() @Min(0) totalAmount!: number;
  @IsNumber() @Min(0) paidAmount!: number;
  @IsNumber() @Min(0) remainingAmount!: number;
  @IsInt() @Min(1) installmentCount!: number;
  @IsArray() schedule!: Record<string, unknown>[];
}
