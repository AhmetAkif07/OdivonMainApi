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

export class BeautyNailWarrantyDto {
  @IsString() customerId!: string;
  @IsString() customerName!: string;
  @IsString() phone!: string;
  @IsISO8601() appliedDate!: string;
  @IsISO8601() warrantyExpireDate!: string;
  @IsString() technicianStaffName!: string;
  @IsString() technique!: string;
  @IsString() nailShape!: string;
  @IsString() swatchCode!: string;
  @IsIn(['active', 'claimed', 'expired']) status!: string;
  @IsOptional() @IsString() claimedAt?: string;
  @IsOptional() @IsString() damagedFinger?: string;
  @IsOptional() @IsString() repairNotes?: string;
  @IsOptional() @IsString() branchId?: string;
}

export class BeautyNailSterilizationDto {
  @IsString() cycleNumber!: string;
  @IsString() autoclaveDeviceName!: string;
  @IsString() sterilizedAt!: string;
  @IsString() sterilizedByStaffName!: string;
  @IsNumber() temperatureCelsius!: number;
  @IsNumber() pressureBar!: number;
  @IsNumber() holdTimeMinutes!: number;
  @IsBoolean() indicatorStripPassed!: boolean;
  @IsString() batchPouchBarcode!: string;
  @IsNumber() instrumentCount!: number;
  @IsOptional() @IsString() assignedCustomerName?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() branchId?: string;
}


export class BeautyPurchaseRequisitionDto {
  @IsString() code!: string;
  @IsString() requestedByStaffName!: string;
  @IsString() requestedAt!: string;
  @IsString() requiredDate!: string;
  @IsIn(['low', 'normal', 'high', 'urgent']) priority!: string;
  @IsString() category!: string;
  @IsArray() items!: Array<Record<string, unknown>>;
  @IsNumber() estimatedTotal!: number;
  @IsString() reason!: string;
  @IsIn(['draft', 'pending_approval', 'approved', 'rejected', 'ordered', 'cancelled']) status!: string;
  @IsOptional() @IsNumber() currentApprovalLevel?: number;
  @IsOptional() @IsArray() approvalFlow?: Array<Record<string, unknown>>;
  @IsOptional() @IsString() purchaseOrderId?: string;
  @IsOptional() @IsString() branchId?: string;
}

export class BeautyPurchaseOrderDto {
  @IsString() poNumber!: string;
  @IsOptional() @IsString() requisitionId?: string;
  @IsString() supplierId!: string;
  @IsString() supplierName!: string;
  @IsString() orderDate!: string;
  @IsString() expectedDeliveryDate!: string;
  @IsString() paymentTerms!: string;
  @IsString() currency!: string;
  @IsArray() items!: Array<Record<string, unknown>>;
  @IsNumber() subtotal!: number;
  @IsNumber() taxTotal!: number;
  @IsNumber() grandTotal!: number;
  @IsIn(['draft', 'pending_approval', 'approved', 'sent_to_supplier', 'partially_received', 'completed', 'cancelled']) status!: string;
  @IsIn(['waiting', 'in_transit', 'partially_received', 'delivered', 'returned']) deliveryStatus!: string;
  @IsIn(['unpaid', 'partially_paid', 'paid']) paymentStatus!: string;
  @IsOptional() @IsArray() approvalFlow?: Array<Record<string, unknown>>;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() branchId?: string;
}

export class BeautyGoodsReceiptDto {
  @IsString() receiptNumber!: string;
  @IsString() purchaseOrderId!: string;
  @IsString() poNumber!: string;
  @IsString() supplierName!: string;
  @IsString() waybillNumber!: string;
  @IsOptional() @IsString() invoiceNumber?: string;
  @IsString() receivedAt!: string;
  @IsString() receivedByStaffName!: string;
  @IsArray() items!: Array<Record<string, unknown>>;
  @IsIn(['verified', 'discrepancy', 'rejected']) status!: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() branchId?: string;
}


export class BeautyPaymentLinkDto {
  @IsString() linkCode!: string;
  @IsString() customerId!: string;
  @IsString() customerName!: string;
  @IsString() customerPhone!: string;
  @IsOptional() @IsString() customerEmail?: string;
  @IsNumber() amount!: number;
  @IsIn(['deposit', 'package_installment', 'service_checkout', 'wallet_topup', 'custom']) paymentType!: string;
  @IsString() title!: string;
  @IsOptional() @IsString() description?: string;
  @IsString() expiresAt!: string;
  @IsIn(['pending', 'viewed', 'paid', 'expired', 'cancelled']) status!: string;
  @IsOptional() @IsString() paidAt?: string;
  @IsOptional() @IsString() paymentMethod?: string;
  @IsOptional() @IsString() transactionId?: string;
  @IsOptional() @IsNumber() installmentCount?: number;
  @IsOptional() @IsString() appointmentId?: string;
  @IsOptional() @IsString() packageId?: string;
  @IsOptional() @IsString() branchId?: string;
}


export class BeautySmsProviderDto {
  @IsString() providerId!: string;
  @IsString() providerName!: string;
  @IsBoolean() isActive!: boolean;
  @IsBoolean() isDefault!: boolean;
  @IsString() originator!: string;
  @IsOptional() @IsString() username?: string;
  @IsOptional() @IsString() password?: string;
  @IsOptional() @IsString() apiKey?: string;
  @IsOptional() @IsString() apiSecret?: string;
  @IsOptional() @IsString() accountSid?: string;
  @IsOptional() @IsString() authToken?: string;
  @IsOptional() @IsNumber() balance?: number;
  @IsOptional() @IsString() lastTestedAt?: string;
}

export class BeautySmsTemplateDto {
  @IsString() templateKey!: string;
  @IsString() title!: string;
  @IsString() content!: string;
  @IsBoolean() isAutoSend!: boolean;
  @IsOptional() @IsString() triggerEvent?: string;
  @IsOptional() @IsNumber() timingHours?: number;
  @IsOptional() @IsString() defaultSenderTitle?: string;
}

export class BeautySmsLogDto {
  @IsString() recipientPhone!: string;
  @IsString() recipientName!: string;
  @IsString() messageContent!: string;
  @IsString() providerId!: string;
  @IsString() senderTitle!: string;
  @IsString() status!: string;
  @IsNumber() smsCount!: number;
  @IsOptional() @IsString() templateKey?: string;
  @IsOptional() @IsString() appointmentId?: string;
  @IsOptional() @IsString() customerId?: string;
}
