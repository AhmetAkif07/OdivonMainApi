import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { PagingQueryDto } from '../../../shared/http/paging.dto';

export class CreateMemberDto {
  @ApiProperty()
  @IsString()
  displayName!: string;

  @ApiProperty()
  @IsEmail()
  email!: string;

  // 6 is Firebase Auth's own minimum; no other rules for member sign-up.
  @ApiProperty({ minLength: 6 })
  @IsString()
  @MinLength(6)
  password!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

    @ApiProperty({ description: 'T.C. kimlik no: 11 hane, 0 ile başlamaz' })
  @IsString()
  @Matches(/^[1-9]\d{10}$/, { message: 'nationalId must be an 11-digit T.C. identity number' })
  nationalId!: string;

  @ApiPropertyOptional({ enum: ['female', 'male', 'unspecified'] })
  @IsOptional()
  @IsIn(['female', 'male', 'unspecified'])
  gender?: 'female' | 'male' | 'unspecified';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  birthDate?: string | null;

  @ApiPropertyOptional({ enum: ['trial', 'active', 'expired', 'cancelled'] })
  @IsOptional()
  @IsIn(['trial', 'active', 'expired', 'cancelled'])
  membershipStatus?: 'trial' | 'active' | 'expired' | 'cancelled';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  packageLabel?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  packagePrice?: number;

  @ApiPropertyOptional({ description: 'KVKK aydınlatma ve açık rıza onayı' })
  @IsOptional()
  @IsBoolean()
  kvkkConsent?: boolean | null;

  @ApiPropertyOptional({ description: 'KVKK onay zaman damgası' })
  @IsOptional()
  @IsString()
  kvkkConsentAt?: string | null;

  @ApiPropertyOptional({ description: 'Ticari elektronik ileti onayı (SMS/E-posta)' })
  @IsOptional()
  @IsBoolean()
  commercialConsent?: boolean | null;

  @ApiPropertyOptional({ description: 'Ticari ileti onay zaman damgası' })
  @IsOptional()
  @IsString()
  commercialConsentAt?: string | null;

  @ApiPropertyOptional({ description: 'Özel nitelikli sağlık/biyometrik veri onayı' })
  @IsOptional()
  @IsBoolean()
  healthConsent?: boolean | null;

  @ApiPropertyOptional({ description: 'Sağlık verisi onay zaman damgası' })
  @IsOptional()
  @IsString()
  healthConsentAt?: string | null;

  @ApiPropertyOptional({ description: 'Kayıtla birlikte satılan paket; fiyat paket kaydından alınır' })
  @IsOptional()
  @IsString()
  packageId?: string | null;

  @ApiPropertyOptional({ description: 'Kasaya işlenen tutar (0…paket fiyatı); eksik kısım borç olur' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  paidAmount?: number;

  @ApiPropertyOptional({ enum: ['cash', 'card', 'transfer'] })
  @IsOptional()
  @IsIn(['cash', 'card', 'transfer'])
  paymentMethod?: 'cash' | 'card' | 'transfer';

  @ApiPropertyOptional({ description: 'Kalan borcun vadesi (YYYY-MM-DD); varsayılan bir ay sonra' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  debtDueDate?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 36, description: 'Kalan borcun taksit sayısı; varsayılan 1' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(36)
  debtInstallments?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  branchId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  branchName?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  membershipStartDate?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  membershipEndDate?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  memberNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  trainerId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  trainerName?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  emergencyContactName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  emergencyContactPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  emergencyContactRelation?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bloodGroup?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  allergies?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  chronicDiseases?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  specialInfo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  photoURL?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  rfidCardNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  cardDepositFee?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  cardDepositPaid?: boolean;
}

export class UpdateMemberDto extends PartialType(OmitType(CreateMemberDto, [
  'email',
  'password',
  // Sale fields only apply when the member is created; later sales go through wallet/receivables.
  'packageId',
  'paidAmount',
  'paymentMethod',
  'debtDueDate',
  'debtInstallments',
] as const)) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isArchived?: boolean;
}

export class RenewMemberDto {
  @ApiProperty()
  @IsString()
  packageName!: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  durationDays!: number;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  price!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class FreezeMemberDto {
  @ApiProperty()
  @IsInt()
  @Min(1)
  freezeDays!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}

export class CancelMemberDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}

export class ListMembersQueryDto extends PagingQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  q?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === '' ? undefined : value === true || value === 'true'))
  @IsBoolean()
  archived?: boolean;
}
