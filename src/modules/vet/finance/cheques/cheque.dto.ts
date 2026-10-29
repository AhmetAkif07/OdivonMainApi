import { ApiProperty, ApiPropertyOptional, PartialType, OmitType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsISO8601, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { PagingQueryDto } from '../../../../shared/http/paging.dto';
import {
  CHEQUE_DIRECTIONS,
  CHEQUE_KINDS,
  CHEQUE_STATUSES,
  ChequeDirection,
  ChequeKind,
  ChequeStatus,
} from './cheque.entity';

export class CreateChequeDto {
  @ApiProperty({ enum: CHEQUE_KINDS })
  @IsIn(CHEQUE_KINDS)
  kind!: ChequeKind;

  @ApiProperty({ enum: CHEQUE_DIRECTIONS })
  @IsIn(CHEQUE_DIRECTIONS)
  direction!: ChequeDirection;

  @ApiPropertyOptional({ description: 'Required when received' })
  @IsOptional()
  @IsString()
  customerId?: string | null;

  @ApiPropertyOptional({ description: 'Required when issued' })
  @IsOptional()
  @IsString()
  supplierId?: string | null;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @ApiProperty()
  @IsISO8601()
  issueDate!: string;

  @ApiProperty()
  @IsISO8601()
  dueDate!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  serialNo?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bankName?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  drawer?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remark?: string | null;
}

export class UpdateChequeDto extends PartialType(OmitType(CreateChequeDto, ['direction'] as const)) {}

export class ChangeChequeStatusDto {
  @ApiProperty({ enum: CHEQUE_STATUSES })
  @IsIn(CHEQUE_STATUSES)
  status!: ChequeStatus;

  @ApiPropertyOptional({ description: 'Settlement date; defaults to today' })
  @IsOptional()
  @IsISO8601()
  date?: string;

  @ApiPropertyOptional({ description: 'Used for the collection/payment record when settling' })
  @IsOptional()
  @IsString()
  paymentMethodId?: string | null;

  @ApiPropertyOptional({ description: 'Used for the collection/payment record when settling' })
  @IsOptional()
  @IsString()
  cashRegisterId?: string | null;

  @ApiPropertyOptional({ description: 'Required when endorsing' })
  @IsOptional()
  @IsString()
  endorsedTo?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remark?: string | null;
}

export class ChequeQueryDto extends PagingQueryDto {
  @ApiPropertyOptional({ enum: CHEQUE_DIRECTIONS })
  @IsOptional()
  @IsIn(CHEQUE_DIRECTIONS)
  direction?: ChequeDirection;

  @ApiPropertyOptional({ enum: CHEQUE_STATUSES })
  @IsOptional()
  @IsIn(CHEQUE_STATUSES)
  status?: ChequeStatus;
}

export class PaymentCalendarQueryDto {
  @ApiProperty({ example: '2026-11-01' })
  @IsISO8601()
  from!: string;

  @ApiProperty({ example: '2026-11-30' })
  @IsISO8601()
  to!: string;
}
