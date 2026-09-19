import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsISO8601, IsOptional, IsString } from 'class-validator';
import { PagingQueryDto } from '../../../../shared/http/paging.dto';

function emptyToUndefined({ value }: { value: unknown }): unknown {
  if (value === '' || value === null) {
    return undefined;
  }
  return value;
}

export class ListPatientsQueryDto extends PagingQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Transform(emptyToUndefined)
  customerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  @Transform(emptyToUndefined)
  createdFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  @Transform(emptyToUndefined)
  createdTo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  @Transform(emptyToUndefined)
  appointmentFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  @Transform(emptyToUndefined)
  appointmentTo?: string;
}
