import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { BaseDocument } from '../../../../shared/firestore/base-document';

export interface IncomeSummaryDto {
  cash: number;
  posCard: number;
  bankTransfer: number;
  wallet: number;
  total: number;
  packageSaleCount: number;
  shopSaleCount: number;
  receivableCollectionCount: number;
  totalTransactionCount: number;
}

export interface ExpenseSummaryDto {
  cash: number;
  bank: number;
  total: number;
  count: number;
}

export interface GymDailyClosing extends BaseDocument {
  tenantId?: string;
  closingNumber: string; // 'Z-20261002-001'
  date: string; // 'YYYY-MM-DD'
  branchId?: string;
  branchName?: string;
  closedByStaffId: string;
  closedByStaffName: string;

  // Opening float
  openingCash: number;

  // Summaries
  incomeSummary: IncomeSummaryDto;
  expenseSummary: ExpenseSummaryDto;

  // Expected vs Counted
  expectedCash: number;
  actualCashCounted: number;
  cashDifference: number; // actual - expected (+ surplus, - shortage)

  expectedPos: number;
  actualPosCounted: number;
  posDifference: number;

  // Carry-over & Bank Deposit
  retainedCashForNextDay: number;
  bankDepositAmount: number;

  notes?: string;
  status: 'draft' | 'closed' | 'verified';
  closedAt: string;
  verifiedByStaffId?: string;
  verifiedByStaffName?: string;
  verifiedAt?: string;
}

export interface PreClosePreviewResponse {
  date: string;
  branchId?: string;
  openingCash: number;
  incomeSummary: IncomeSummaryDto;
  expenseSummary: ExpenseSummaryDto;
  expectedCash: number;
  expectedPos: number;
  isAlreadyClosed: boolean;
  existingClosing?: GymDailyClosing;
}

export class SubmitDailyCloseDto {
  @ApiProperty({ example: '2026-10-02' })
  @IsString()
  date!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  branchName?: string;

  @ApiProperty({ description: 'Kasada sayılan fiziki nakit toplamı', example: 4500 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  actualCashCounted!: number;

  @ApiPropertyOptional({ description: 'Fiziki POS gün sonu slipleri toplamı', example: 12500 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  actualPosCounted?: number;

  @ApiPropertyOptional({ description: 'Ertesi güne bozuk para kasası olarak bırakılacak tutar', example: 1000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  retainedCashForNextDay?: number;

  @ApiPropertyOptional({ description: 'Bankaya yatırılmak üzere ayrılan nakit', example: 3500 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  bankDepositAmount?: number;

  @ApiPropertyOptional({ description: 'Kasa açığı/fazlası veya vardiya notları' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class VerifyDailyCloseDto {
  @ApiPropertyOptional({ description: 'Yönetici onay notu' })
  @IsOptional()
  @IsString()
  notes?: string;
}
