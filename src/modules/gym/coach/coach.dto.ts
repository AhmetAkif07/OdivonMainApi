import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { MemberRequestType, REQUEST_TYPES } from '../shared/member-requests';

export class CoachMembersQueryDto {
  /** `mine` (default): members assigned to the signed-in trainer; `all`: every member of the gym. */
  @IsOptional()
  @IsIn(['mine', 'all'])
  scope?: 'mine' | 'all';

  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}

export class CoachSessionsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  planId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class CoachRequestsQueryDto {
  @IsOptional()
  @IsIn(['all', ...REQUEST_TYPES])
  type?: 'all' | MemberRequestType;

  @IsOptional()
  @IsIn(['open', 'closed', 'all'])
  status?: 'open' | 'closed' | 'all';
}
