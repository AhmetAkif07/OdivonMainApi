import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString, Matches, MaxLength, ValidateNested } from 'class-validator';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export class SessionQueryDto {
  @ApiPropertyOptional({ description: 'Seans günü YYYY-MM-DD; varsayılan dersin bir sonraki seansı' })
  @IsOptional()
  @Matches(DAY)
  date?: string;
}

export class StaffBookingDto {
  @ApiProperty({ description: 'Üye uid' })
  @IsString()
  userId!: string;

  @ApiPropertyOptional({ description: 'Seans günü YYYY-MM-DD; varsayılan bir sonraki seans' })
  @IsOptional()
  @Matches(DAY)
  sessionDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  notes?: string;

  /** Older panels send the class name; it is taken from the schedule instead. */
  @IsOptional()
  @IsString()
  className?: string;
}

export class StaffWaitlistDto {
  @ApiProperty()
  @IsString()
  userId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(DAY)
  sessionDate?: string;
}

export class AttendanceEntryDto {
  @IsString()
  bookingId!: string;

  @IsIn(['checked-in', 'no-show'])
  status!: 'checked-in' | 'no-show';
}

export class AttendanceDto {
  @ApiProperty({ description: 'Seans günü YYYY-MM-DD' })
  @Matches(DAY)
  sessionDate!: string;

  @ApiProperty({ type: [AttendanceEntryDto] })
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => AttendanceEntryDto)
  entries!: AttendanceEntryDto[];
}

export class PromoteDto {
  @ApiProperty()
  @Matches(DAY)
  sessionDate!: string;
}
