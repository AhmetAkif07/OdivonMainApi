import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsISO8601, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { PagingQueryDto } from '../../../shared/http/paging.dto';

export class ListGymAuditQueryDto extends PagingQueryDto {
  @ApiPropertyOptional({ description: 'ISO tarih-saat, dahil' })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({ description: 'ISO tarih-saat, dahil' })
  @IsOptional()
  @IsISO8601()
  to?: string;

  @ApiPropertyOptional({ description: 'İşlemi yapan kullanıcı (uid)' })
  @IsOptional()
  @IsString()
  actorId?: string;

  @ApiPropertyOptional({ description: 'İşlemi yapanın e-postası (büyük/küçük harf duyarsız)' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  actorEmail?: string;

  @ApiPropertyOptional({ description: 'Modül, örn. members, wallet, receivables' })
  @IsOptional()
  @IsString()
  entity?: string;

  @ApiPropertyOptional({ description: 'İşlemden etkilenen üye (uid)' })
  @IsOptional()
  @IsString()
  targetUserId?: string;

  @ApiPropertyOptional({ enum: ['success', 'error'] })
  @IsOptional()
  @IsIn(['success', 'error'])
  result?: 'success' | 'error';

  @ApiPropertyOptional({ enum: ['create', 'update', 'delete', 'action'] })
  @IsOptional()
  @IsIn(['create', 'update', 'delete', 'action'])
  verb?: 'create' | 'update' | 'delete' | 'action';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}

export class MemberHistoryQueryDto {
  @ApiPropertyOptional({ default: 100, maximum: 300 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(300)
  limit?: number;

  @ApiPropertyOptional({ description: 'ISO tarih-saat; bundan eski kayıtlar (sayfalama)' })
  @IsOptional()
  @IsISO8601()
  before?: string;
}
