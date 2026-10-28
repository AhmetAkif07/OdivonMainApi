import { Type } from 'class-transformer';
import { IsArray, IsEmail, IsIn, IsInt, IsISO8601, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

export class ListDrivingSchoolQueryDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
  @IsOptional() @IsString() cursor?: string;
}
export class ScheduleQueryDto { @IsISO8601() from!: string; @IsISO8601() to!: string; }
export class CreateStudentDto {
  @IsString() @MinLength(2) fullName!: string; @IsEmail() email!: string; @IsString() @MinLength(7) phone!: string;
  @IsString() licenseClass!: string; @IsOptional() @IsIn(['active','graduated','frozen','cancelled']) status?: 'active'|'graduated'|'frozen'|'cancelled';
  @IsOptional() @IsInt() @Min(0) documentCount?: number;
}
export class UpdateStudentDto { @IsOptional() @IsString() @MinLength(2) fullName?: string; @IsOptional() @IsEmail() email?: string; @IsOptional() @IsString() phone?: string; @IsOptional() @IsString() licenseClass?: string; @IsOptional() @IsIn(['active','graduated','frozen','cancelled']) status?: 'active'|'graduated'|'frozen'|'cancelled'; @IsOptional() @IsInt() @Min(0) documentCount?: number; }
export class CreateInstructorDto {
  @IsString() @MinLength(2) fullName!: string; @IsOptional() @IsEmail() email?: string; @IsOptional() @IsString() phone?: string; @IsString() @MinLength(2) certificateNumber!: string;
  @IsArray() @IsString({ each: true }) licenseClasses!: string[]; @IsOptional() @IsIn(['active','leave','inactive']) status?: 'active'|'leave'|'inactive';
}
export class UpdateInstructorDto { @IsOptional() @IsString() fullName?: string; @IsOptional() @IsEmail() email?: string; @IsOptional() @IsString() phone?: string; @IsOptional() @IsString() certificateNumber?: string; @IsOptional() @IsArray() @IsString({each:true}) licenseClasses?: string[]; @IsOptional() @IsIn(['active','leave','inactive']) status?: 'active'|'leave'|'inactive'; }
export class CreateVehicleDto {
  @IsString() @MinLength(5) plate!: string; @IsString() brand!: string; @IsString() model!: string; @IsInt() @Min(1980) @Max(2100) year!: number; @IsString() licenseClass!: string;
  @IsOptional() @IsIn(['available','lesson','maintenance','inactive']) status?: 'available'|'lesson'|'maintenance'|'inactive'; @IsOptional() @IsISO8601() inspectionDate?: string; @IsOptional() @IsISO8601() insuranceDate?: string;
}
export class UpdateVehicleDto { @IsOptional() @IsString() plate?: string; @IsOptional() @IsString() brand?: string; @IsOptional() @IsString() model?: string; @IsOptional() @IsInt() @Min(1980) @Max(2100) year?: number; @IsOptional() @IsString() licenseClass?: string; @IsOptional() @IsIn(['available','lesson','maintenance','inactive']) status?: 'available'|'lesson'|'maintenance'|'inactive'; @IsOptional() @IsISO8601() inspectionDate?: string; @IsOptional() @IsISO8601() insuranceDate?: string; }
export class CreateLessonDto { @IsString() studentId!: string; @IsString() instructorId!: string; @IsString() vehicleId!: string; @IsISO8601() startsAt!: string; @IsISO8601() endsAt!: string; @IsOptional() @IsString() notes?: string; }
export class UpdateLessonDto { @IsOptional() @IsString() studentId?: string; @IsOptional() @IsString() instructorId?: string; @IsOptional() @IsString() vehicleId?: string; @IsOptional() @IsISO8601() startsAt?: string; @IsOptional() @IsISO8601() endsAt?: string; @IsOptional() @IsString() notes?: string; }
export class LessonStatusDto { @IsIn(['scheduled','completed','cancelled','postponed']) status!: 'scheduled'|'completed'|'cancelled'|'postponed'; }
