import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsISO8601, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { PAGE_PRIORITIES, PAGE_TARGET_TYPES, PagePriority, PageTargetType } from './paging.entity';

export class SendPageDto {
  @ApiProperty({ enum: PAGE_TARGET_TYPES })
  @IsIn(PAGE_TARGET_TYPES)
  targetType!: PageTargetType;

  @ApiPropertyOptional({ description: 'User uid or role id; empty for everyone' })
  @IsOptional()
  @IsString()
  targetId?: string | null;

  @ApiPropertyOptional({ enum: PAGE_PRIORITIES, default: 'normal' })
  @IsOptional()
  @IsIn(PAGE_PRIORITIES)
  priority?: PagePriority;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  message!: string;
}

export class InboxQueryDto {
  @ApiPropertyOptional({ description: 'Only pages created after this ISO time (default: last 24 hours)' })
  @IsOptional()
  @IsISO8601()
  since?: string;
}
