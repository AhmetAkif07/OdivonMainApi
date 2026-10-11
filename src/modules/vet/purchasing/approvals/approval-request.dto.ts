import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import {
  APPROVAL_STATUSES,
  APPROVAL_TARGET_TYPES,
  ApprovalStatus,
  ApprovalTargetType,
} from './approval-request.entity';

export class SubmitApprovalDto {
  @ApiProperty({ enum: APPROVAL_TARGET_TYPES, example: 'demand' })
  @IsIn(APPROVAL_TARGET_TYPES)
  targetType!: ApprovalTargetType;

  @ApiProperty({ example: 'dem-123' })
  @IsString()
  @IsNotEmpty()
  targetId!: string;

  @ApiProperty({ example: 'TLP-2026-0012' })
  @IsString()
  @IsNotEmpty()
  documentNo!: string;

  @ApiProperty({ example: 'Q4 Aşı ve Cerrahi Malzeme Alımı' })
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiProperty({ example: 48500 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  totalAmount!: number;

  @ApiPropertyOptional({ example: null })
  @IsOptional()
  @IsString()
  branchId?: string | null;

  @ApiPropertyOptional({ example: 'Dr. Ahmet Yılmaz' })
  @IsOptional()
  @IsString()
  requestedByUserName?: string;
}

export class DecideApprovalDto {
  @ApiProperty({ enum: ['approved', 'rejected', 'returned'], example: 'approved' })
  @IsIn(['approved', 'rejected', 'returned'])
  decision!: 'approved' | 'rejected' | 'returned';

  @ApiPropertyOptional({ example: 'Bütçe ve teknik spekler incelendi, onaylandı.' })
  @IsOptional()
  @IsString()
  comment?: string;
}

export class ListApprovalRequestsQueryDto {
  @ApiPropertyOptional({ enum: APPROVAL_STATUSES })
  @IsOptional()
  @IsIn(APPROVAL_STATUSES)
  status?: ApprovalStatus;

  @ApiPropertyOptional({ enum: APPROVAL_TARGET_TYPES })
  @IsOptional()
  @IsIn(APPROVAL_TARGET_TYPES)
  targetType?: ApprovalTargetType;
}
