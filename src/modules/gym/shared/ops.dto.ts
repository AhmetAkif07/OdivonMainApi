import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  Allow,
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { PagingQueryDto } from '../../../shared/http/paging.dto';
import { GATE_PROTOCOLS, GateProtocol } from '../access/access-rules';

export class GymListQueryDto extends PagingQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  memberId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  trainerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  scheduleId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  productId?: string;
}

export class GymRecordDto {
  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  memberId?: string;

  @IsOptional()
  @IsString()
  packageId?: string;

  @IsOptional()
  @IsString()
  trainerId?: string;

  @IsOptional()
  @IsString()
  trainerName?: string;

  @IsOptional()
  @IsString()
  instructorId?: string;

  @IsOptional()
  @IsString()
  instructorName?: string;

  @IsOptional()
  @IsString()
  disciplineId?: string | null;

  @IsOptional()
  @IsString()
  facilityId?: string | null;

  @IsOptional()
  @IsString()
  branchId?: string | null;

  @IsOptional()
  @IsString()
  branchName?: string | null;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  date?: string;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string | null;

  @IsOptional()
  @IsString()
  startTime?: string;

  @IsOptional()
  @IsString()
  endTime?: string;

  @IsOptional()
  @IsString()
  appointmentTime?: string;

  @IsOptional()
  @IsNumber()
  dayOfWeek?: number;

  @IsOptional()
  @IsNumber()
  capacity?: number;

  @IsOptional()
  @IsNumber()
  duration?: number;

  @IsOptional()
  @IsNumber()
  durationDays?: number;

  @IsOptional()
  @IsNumber()
  amount?: number;

  @IsOptional()
  @IsNumber()
  price?: number;

  @IsOptional()
  @IsNumber()
  stock?: number;

  @IsOptional()
  @IsNumber()
  quantity?: number;

  @IsOptional()
  @IsNumber()
  cost?: number;

  @IsOptional()
  @IsNumber()
  unitPrice?: number;

  @IsOptional()
  @IsNumber()
  totalAmount?: number;

  @IsOptional()
  @IsNumber()
  discount?: number;

  @IsOptional()
  @IsNumber()
  weight?: number;

  @IsOptional()
  @IsNumber()
  height?: number;

  @IsOptional()
  @IsNumber()
  chest?: number;

  @IsOptional()
  @IsNumber()
  waist?: number;

  @IsOptional()
  @IsNumber()
  hips?: number;

  @IsOptional()
  @IsNumber()
  bicep?: number;

  @IsOptional()
  @IsNumber()
  thigh?: number;

  @IsOptional()
  @IsNumber()
  calf?: number;

  @IsOptional()
  @IsNumber()
  bodyFatPercentage?: number;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  sku?: string;

  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  gender?: string;

  @IsOptional()
  @IsString()
  interestCategory?: string;

  @IsOptional()
  @IsString()
  visitReason?: string;

  @IsOptional()
  @IsString()
  surveyNotes?: string;

  @IsOptional()
  @IsString()
  budgetRange?: string;

  @IsOptional()
  @IsString()
  followUpDate?: string | null;

  @IsOptional()
  @IsString()
  assignedStaffName?: string;

  /** Lead source (walk_in, instagram, referral, …). */
  @IsOptional()
  @IsString()
  source?: string;

  /** Member who referred this lead (referral programme). */
  @IsOptional()
  @IsString()
  referrerMemberId?: string | null;

  @IsOptional()
  @IsString()
  referrerName?: string | null;

  @IsOptional()
  @IsString()
  lostReason?: string | null;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  @IsString()
  colorTag?: string;

  @IsOptional()
  @IsArray()
  requiredDocuments?: string[];

  @IsOptional()
  @IsArray()
  supportedSessionTypes?: string[];

  @IsOptional()
  @IsArray()
  enrolledMemberIds?: string[];

  @IsOptional()
  @IsArray()
  disciplineIds?: string[];

  @IsOptional()
  @IsArray()
  targetMuscleGroups?: string[];

  @IsOptional()
  @IsArray()
  exercises?: unknown[];

  @IsOptional()
  @IsArray()
  items?: unknown[];

  @IsOptional()
  @IsArray()
  channels?: string[];

  @IsOptional()
  @IsArray()
  recipients?: string[];

  @IsOptional()
  @IsString()
  level?: string;

  @IsOptional()
  @IsString()
  goal?: string;

  @IsOptional()
  @IsNumber()
  targetDaysPerWeek?: number;

  @IsOptional()
  @IsString()
  brandModel?: string;

  @IsOptional()
  @IsString()
  serialOrTag?: string;

  @IsOptional()
  @IsString()
  condition?: string;

  @IsOptional()
  @IsString()
  lastMaintenanceDate?: string | null;

  @IsOptional()
  @IsString()
  documentType?: string;

  @IsOptional()
  @IsString()
  documentName?: string;

  @IsOptional()
  @IsString()
  fileUrl?: string | null;

  @IsOptional()
  @IsString()
  issueDate?: string;

  @IsOptional()
  @IsString()
  expiryDate?: string | null;

  @IsOptional()
  @IsString()
  classScheduleId?: string;

  @IsOptional()
  @IsString()
  className?: string;

  @IsOptional()
  @IsString()
  productId?: string;

  @IsOptional()
  @IsString()
  productName?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsString()
  supplier?: string;

  /** Product: supplier record the product is bought from (purchase orders). */
  @IsOptional()
  @IsString()
  supplierId?: string;

  /** Product: stock at or below this is "low" (default 5 when unset). */
  @IsOptional()
  @IsNumber()
  @Min(0)
  minStock?: number;

  /** Product: usual purchase quantity suggested when the stock is low. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  reorderQty?: number;

  @IsOptional()
  @IsString()
  referenceId?: string;

  @IsOptional()
  @IsString()
  referenceType?: string;

  @IsOptional()
  @IsString()
  entryDate?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  direction?: string;

  @IsOptional()
  @IsString()
  readerType?: string;

  @IsOptional()
  @IsString()
  connectionProtocol?: string;

  @IsOptional()
  @IsString()
  endpoint?: string;

  @IsOptional()
  @IsString()
  topicOrChannel?: string;

  @IsOptional()
  @IsNumber()
  port?: number | null;

  @IsOptional()
  @IsIn(GATE_PROTOCOLS)
  protocol?: GateProtocol;

  @IsOptional()
  @IsString()
  host?: string | null;

  @IsOptional()
  @IsString()
  secretToken?: string | null;

  @IsOptional()
  @IsString()
  method?: string;

  @IsOptional()
  @IsString()
  gateName?: string;

  @IsOptional()
  @IsString()
  userName?: string;

  @IsOptional()
  @IsString()
  userPhoto?: string | null;

  @IsOptional()
  @IsString()
  rfidCardNumber?: string;

  @IsOptional()
  @IsString()
  uid?: string;

  @IsOptional()
  @IsString()
  token?: string;

  @IsOptional()
  @IsString()
  discountType?: string;

  @IsOptional()
  @IsNumber()
  discountValue?: number;

  @IsOptional()
  @IsString()
  giftDescription?: string;

  @IsOptional()
  @IsString()
  promoCode?: string;

  @IsOptional()
  @IsString()
  validFrom?: string;

  @IsOptional()
  @IsString()
  validUntil?: string;

  @IsOptional()
  @IsString()
  targetAudience?: string;

  @IsOptional()
  @IsObject()
  messageTemplate?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  message?: string;

  @IsOptional()
  @IsString()
  segment?: string;

  @IsOptional()
  @IsString()
  provider?: string;

  @IsOptional()
  @IsString()
  header?: string;

  @IsOptional()
  @IsString()
  apiKey?: string;

  @IsOptional()
  @IsString()
  apiSecret?: string;

  @IsOptional()
  @IsString()
  senderPhone?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsNumber()
  balanceCredits?: number;

  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsString()
  companyTitle?: string;

  @IsOptional()
  @IsString()
  companyVkn?: string;

  @IsOptional()
  @IsString()
  webServiceUrl?: string;

  @IsOptional()
  @IsBoolean()
  isTestEnvironment?: boolean;

  @IsOptional()
  @IsBoolean()
  autoSendOnPayment?: boolean;

  @IsOptional()
  @IsString()
  prefix?: string;

  @IsOptional()
  @IsString()
  taxOffice?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  invoiceNumber?: string;

  @IsOptional()
  @IsString()
  recipientName?: string;

  @IsOptional()
  @IsString()
  recipientVknOrTckn?: string;

  @IsOptional()
  @IsString()
  recipientTaxOffice?: string;

  @IsOptional()
  @IsString()
  recipientAddress?: string;

  @IsOptional()
  @IsNumber()
  kdvRate?: number;

  @IsOptional()
  @IsNumber()
  kdvAmount?: number;

  @IsOptional()
  @IsString()
  invoiceType?: string;

  @IsOptional()
  @IsString()
  paymentStatus?: string;

  @IsOptional()
  @IsString()
  planId?: string;

  @IsOptional()
  @IsString()
  billingCycle?: string;

  @IsOptional()
  @IsString()
  contactPerson?: string;

  @IsOptional()
  @IsString()
  taxNumber?: string;

  @IsOptional()
  @IsNumber()
  balance?: number;

  @IsOptional()
  @IsString()
  iban?: string;

  @IsOptional()
  @IsString()
  key?: string;

  @IsOptional()
  @IsString()
  badgeClass?: string;

  @IsOptional()
  @IsNumber()
  order?: number;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsString()
  cancellationReason?: string;

  @IsOptional()
  @IsString()
  attendanceStatus?: string;

  @IsOptional()
  @IsIn(['deposit', 'debit', 'refund'])
  walletType?: 'deposit' | 'debit' | 'refund';

  @IsOptional()
  @IsString()
  verifiedBy?: string;

  @IsOptional()
  @IsString()
  verifiedAt?: string;

  @IsOptional()
  @IsString()
  createdByTrainerId?: string;

  @IsOptional()
  @IsString()
  createdByTrainerName?: string;

  @IsOptional()
  @IsString()
  templateId?: string;

  @IsOptional()
  @IsBoolean()
  isSystemDefault?: boolean;

  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsString()
  photoURL?: string | null;

  @IsOptional()
  @IsString()
  bookingDate?: string;

  @IsOptional()
  @IsString()
  checkedInAt?: string | null;

  @IsOptional()
  @IsString()
  completedAt?: string | null;

  @IsOptional()
  @IsString()
  saleDate?: string;

  @IsOptional()
  @IsString()
  timestamp?: string;

  @IsOptional()
  @IsString()
  command?: string;

  @IsOptional()
  @IsString()
  targetDevice?: string;

  @IsOptional()
  @IsString()
  trialEndsAt?: string;

  @IsOptional()
  @IsString()
  currentPeriodStartsAt?: string;

  @IsOptional()
  @IsString()
  currentPeriodEndsAt?: string;

  @IsOptional()
  @IsObject()
  stats?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  gibUuid?: string;

  @IsOptional()
  @Transform(({ value }) => value)
  @Allow()
  extras?: unknown;
}

/** Turnstile screens: poll the access logs while the Edge Agent and the device are online. */
export class AccessSettingsDto {
  @IsBoolean()
  liveRefresh!: boolean;
}
