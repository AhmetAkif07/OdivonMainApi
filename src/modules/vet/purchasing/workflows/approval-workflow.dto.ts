import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  APPROVAL_POLICIES,
  APPROVER_TYPES,
  ApprovalPolicy,
  ApproverType,
  WORKFLOW_TARGET_TYPES,
  WorkflowTargetType,
} from './approval-workflow.entity';

export class ApprovalStepDefinitionDto {
  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  stepOrder!: number;

  @ApiProperty({ example: '1. Kademe: Sorumlu Hekim Onayı' })
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiProperty({ enum: APPROVER_TYPES, example: 'role' })
  @IsIn(APPROVER_TYPES)
  approverType!: ApproverType;

  @ApiPropertyOptional({ example: 'head_vet' })
  @IsOptional()
  @IsString()
  approverRole?: string | null;

  @ApiPropertyOptional({ example: null })
  @IsOptional()
  @IsString()
  approverUserId?: string | null;

  @ApiProperty({ example: 'Başhekim / Birim Sorumlusu' })
  @IsString()
  @IsNotEmpty()
  approverName!: string;

  @ApiPropertyOptional({ enum: APPROVAL_POLICIES, default: 'single' })
  @IsOptional()
  @IsIn(APPROVAL_POLICIES)
  approvalPolicy?: ApprovalPolicy = 'single';

  @ApiPropertyOptional({ example: 48 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  timeoutHours?: number | null;
}

export class CreateApprovalWorkflowDto {
  @ApiProperty({ example: 'Genel Satınalma Onay Senaryosu' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({ example: 'Klinik malzeme ve ecza alımlarında kademeli onay akışı' })
  @IsOptional()
  @IsString()
  description?: string | null;

  @ApiProperty({ enum: WORKFLOW_TARGET_TYPES, example: 'all' })
  @IsIn(WORKFLOW_TARGET_TYPES)
  targetType!: WorkflowTargetType;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minAmount?: number = 0;

  @ApiPropertyOptional({ example: 100000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  maxAmount?: number | null;

  @ApiPropertyOptional({ example: null })
  @IsOptional()
  @IsString()
  branchId?: string | null;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean = true;

  @ApiPropertyOptional({ example: 1500, description: 'Bu tutarın altı otomatik onaylanır' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  autoApproveBelow?: number | null;

  @ApiProperty({ type: [ApprovalStepDefinitionDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ApprovalStepDefinitionDto)
  steps!: ApprovalStepDefinitionDto[];
}

export class UpdateApprovalWorkflowDto extends PartialType(CreateApprovalWorkflowDto) {}
