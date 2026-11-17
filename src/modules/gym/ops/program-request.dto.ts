import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { BaseDocument } from '../../../shared/firestore/base-document';
import { MemberRequestType, REQUEST_TYPES, requestStatus, requestType } from '../shared/member-requests';

/** The original "ask my trainer for a program" form; older app builds still send exactly this. */
export class CreateProgramRequestDto {
  @IsString()
  @MinLength(1)
  goal!: string;

  @IsInt()
  @Min(1)
  @Max(7)
  daysPerWeek!: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

/** Any member request: a program, a change to one, help on the floor, or a measurement. */
export class CreateMemberRequestDto {
  @IsIn(REQUEST_TYPES)
  type!: MemberRequestType;

  /** Program request: what the member wants to achieve. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  goal?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(7)
  daysPerWeek?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  message?: string;

  /** The plan a change is asked for, or the plan being trained when help is called. */
  @IsOptional()
  @IsString()
  @MaxLength(128)
  planId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  sessionId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  dayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  exerciseName?: string;
}

export class ResolveProgramRequestDto {
  @IsIn(['accepted', 'fulfilled', 'rejected'])
  status!: 'accepted' | 'fulfilled' | 'rejected';

  @IsOptional()
  @IsString()
  planId?: string | null;

  /** Older panel builds send the trainer's answer here; it is stored as the reply. */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reply?: string;
}

/** `type=all` lists every kind; without it only program requests, as before. */
export class ProgramRequestQueryDto {
  @IsOptional()
  @IsIn(['all', ...REQUEST_TYPES])
  type?: 'all' | MemberRequestType;
}

type Doc = BaseDocument & Record<string, unknown>;

function text(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

export function toProgramRequest(item: Doc, now = Date.now()) {
  const context = (item['context'] && typeof item['context'] === 'object' ? item['context'] : {}) as Record<string, unknown>;
  return {
    id: item.id,
    userId: String(item['userId'] ?? ''),
    memberName: String(item['memberName'] ?? ''),
    trainerId: (item['trainerId'] as string | null) ?? null,
    trainerName: (item['trainerName'] as string | null) ?? null,
    type: requestType(item),
    goal: String(item['goal'] ?? ''),
    daysPerWeek: Number(item['daysPerWeek'] ?? 0),
    notes: String(item['notes'] ?? ''),
    message: String(item['message'] ?? item['notes'] ?? ''),
    context: {
      planId: text(context['planId']),
      planTitle: text(context['planTitle']),
      dayName: text(context['dayName']),
      exerciseName: text(context['exerciseName']),
      sessionId: text(context['sessionId']),
    },
    status: requestStatus(item, now),
    planId: (item['planId'] as string | null) ?? null,
    reply: text(item['reply']),
    acceptedAt: text(item['acceptedAt']),
    acceptedByName: text(item['acceptedByName']),
    resolvedByName: text(item['resolvedByName']),
    createdAt: item.createdAt,
    resolvedAt: (item['resolvedAt'] as string | null) ?? null,
  };
}
