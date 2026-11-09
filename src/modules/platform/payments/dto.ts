import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class SetPaymentModeDto {
  /** `default` removes the product's own setting; it then follows PAYTR_MODE. */
  @IsIn(['sandbox', 'live', 'default'])
  mode!: 'sandbox' | 'live' | 'default';

  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

export class ResolvePaymentReviewDto {
  @IsString()
  @MaxLength(1000)
  note!: string;
}

export interface PaymentSessionsQuery {
  days?: string;
  status?: string;
  mode?: string;
  provider?: string;
  product?: string;
  source?: string;
  tenantId?: string;
  q?: string;
  limit?: string;
}

export interface PaymentEventsQuery {
  days?: string;
  level?: string;
  type?: string;
  product?: string;
  tenantId?: string;
  q?: string;
  limit?: string;
}
