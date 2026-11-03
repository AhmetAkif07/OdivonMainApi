import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsNumber, IsOptional, IsString, Min } from 'class-validator';
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

export interface BankPosClosingDto {
  bankId: string;
  bankName: string;
  terminalNo?: string;
  posTerminalNo?: string;
  expectedPos: number;
  actualPos: number;
  difference: number;
  slipCount?: number;
  isSlipPrinted?: boolean;
  slipNotes?: string;
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

  // Bank POS Details (Ayrı Ayrı Banka Gün Sonu Slipleri)
  bankPosClosings?: BankPosClosingDto[];

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
  bankPosExpected?: Array<{ bankId: string; bankName: string; terminalNo?: string; expectedPos: number }>;
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

  @ApiPropertyOptional({ description: 'Banka bazında fiziki POS gün sonu slipleri' })
  @IsOptional()
  @IsArray()
  bankPosClosings?: BankPosClosingDto[];

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

export interface DailyCloseReminderSettings extends BaseDocument {
  tenantId?: string;
  enabled: boolean;
  reminderTime: string; // 'HH:mm'
  days?: string[]; // ['0','1','2','3','4','5','6']
  notifyInApp?: boolean;
}

export class UpdateDailyCloseReminderSettingsDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  enabled!: boolean;

  @ApiProperty({ example: '22:00' })
  @IsString()
  reminderTime!: string;

  @ApiPropertyOptional({ example: ['0', '1', '2', '3', '4', '5', '6'] })
  @IsOptional()
  @IsArray()
  days?: string[];

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  notifyInApp?: boolean;
}
