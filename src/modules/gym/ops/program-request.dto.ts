import { IsIn, IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';
import { BaseDocument } from '../../../shared/firestore/base-document';

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

export class ResolveProgramRequestDto {
  @IsIn(['fulfilled', 'rejected'])
  status!: 'fulfilled' | 'rejected';

  @IsOptional()
  @IsString()
  planId?: string | null;

  @IsOptional()
  @IsString()
  notes?: string;
}

type Doc = BaseDocument & Record<string, unknown>;

export function toProgramRequest(item: Doc) {
  return {
    id: item.id,
    userId: String(item['userId'] ?? ''),
    memberName: String(item['memberName'] ?? ''),
    trainerId: (item['trainerId'] as string | null) ?? null,
    trainerName: (item['trainerName'] as string | null) ?? null,
    goal: String(item['goal'] ?? ''),
    daysPerWeek: Number(item['daysPerWeek'] ?? 0),
    notes: String(item['notes'] ?? ''),
    status: String(item['status'] ?? 'pending'),
    planId: (item['planId'] as string | null) ?? null,
    createdAt: item.createdAt,
    resolvedAt: (item['resolvedAt'] as string | null) ?? null,
  };
}
