import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsISO8601, IsOptional, IsString,
  Max, MaxLength, Min, MinLength, ValidateNested,
} from 'class-validator';
import { PagingQueryDto } from '../../shared/http/paging.dto';
import { VehicleCategory } from './parking.types';

const VEHICLES: VehicleCategory[] = ['car', 'motorcycle', 'bicycle', 'electric', 'heavy'];

export class ParkingListQueryDto extends PagingQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() facilityId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() zoneId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() status?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
}

export class CreateFacilityDto {
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(20) code!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) address?: string;
  @ApiProperty() @Type(() => Number) @IsInt() @Min(1) @Max(100_000) capacity!: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
}
export class UpdateFacilityDto extends PartialType(CreateFacilityDto) {}

export class CreateZoneDto {
  @ApiProperty() @IsString() facilityId!: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(100) name!: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(20) code!: string;
  @ApiProperty() @Type(() => Number) @IsInt() @Min(1) @Max(100_000) capacity!: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() slotTracking?: boolean;
  @ApiProperty({ enum: VEHICLES, isArray: true }) @IsArray() @ArrayMinSize(1) @IsIn(VEHICLES, { each: true }) vehicleCategories!: VehicleCategory[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
}
export class UpdateZoneDto extends PartialType(CreateZoneDto) {}

export class CreateSlotDto {
  @ApiProperty() @IsString() facilityId!: string;
  @ApiProperty() @IsString() zoneId!: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(30) code!: string;
  @ApiPropertyOptional({ enum: ['standard', 'disabled', 'vip', 'reserved', 'electric'] })
  @IsOptional() @IsIn(['standard', 'disabled', 'vip', 'reserved', 'electric']) kind?: 'standard' | 'disabled' | 'vip' | 'reserved' | 'electric';
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
}
export class UpdateSlotDto extends PartialType(CreateSlotDto) {
  @ApiPropertyOptional({ enum: ['available', 'occupied', 'blocked'] }) @IsOptional() @IsIn(['available', 'occupied', 'blocked']) status?: 'available' | 'occupied' | 'blocked';
}

export class CreateLaneDto {
  @ApiProperty() @IsString() facilityId!: string;
  @ApiProperty() @IsString() zoneId!: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(100) name!: string;
  @ApiProperty({ enum: ['entry', 'exit', 'bidirectional'] }) @IsIn(['entry', 'exit', 'bidirectional']) direction!: 'entry' | 'exit' | 'bidirectional';
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
}
export class UpdateLaneDto extends PartialType(CreateLaneDto) {}

export class TariffBandDto {
  @ApiProperty() @Type(() => Number) @IsInt() @Min(1) fromMinute!: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) toMinute?: number | null;
  @ApiProperty() @Type(() => Number) @IsInt() @Min(0) priceKurus!: number;
}
export class CreateTariffDto {
  @ApiProperty() @IsString() facilityId!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() zoneId?: string;
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @ApiProperty({ enum: VEHICLES, isArray: true }) @IsArray() @ArrayMinSize(1) @IsIn(VEHICLES, { each: true }) vehicleCategories!: VehicleCategory[];
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(1440) graceMinutes?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) dailyCapKurus?: number;
  @ApiProperty() @Type(() => Number) @IsInt() @Min(0) lostTicketFeeKurus!: number;
  @ApiProperty({ type: [TariffBandDto] }) @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => TariffBandDto) bands!: TariffBandDto[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
}
export class UpdateTariffDto extends PartialType(CreateTariffDto) {
  @ApiProperty() @Type(() => Number) @IsInt() @Min(1) version!: number;
}

export class CreateEntryDto {
  @ApiProperty() @IsString() facilityId!: string;
  @ApiProperty() @IsString() zoneId!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() slotId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() laneId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(24) plate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) ticketCode?: string;
  @ApiProperty({ enum: VEHICLES }) @IsIn(VEHICLES) vehicleCategory!: VehicleCategory;
  @ApiPropertyOptional() @IsOptional() @IsISO8601() occurredAt?: string;
  @ApiPropertyOptional({ enum: ['operator', 'agent'] }) @IsOptional() @IsIn(['operator', 'agent']) source?: 'operator' | 'agent';
}

export class QuoteSessionDto {
  @ApiPropertyOptional() @IsOptional() @IsISO8601() exitAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() lostTicket?: boolean;
}
export class LostTicketDto {
  @ApiProperty() @IsString() @MinLength(3) @MaxLength(300) reason!: string;
  @ApiProperty() @Type(() => Number) @IsInt() @Min(1) version!: number;
}
export class CreatePaymentDto {
  @ApiProperty() @IsString() sessionId!: string;
  @ApiProperty() @IsString() cashShiftId!: string;
  @ApiProperty({ enum: ['cash', 'external_pos'] }) @IsIn(['cash', 'external_pos']) method!: 'cash' | 'external_pos';
  @ApiProperty() @Type(() => Number) @IsInt() @Min(0) amountKurus!: number;
  @ApiProperty() @Type(() => Number) @IsInt() @Min(1) version!: number;
}
export class ExitSessionDto {
  @ApiPropertyOptional() @IsOptional() @IsString() laneId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() slotId?: string;
  @ApiPropertyOptional() @IsOptional() @IsISO8601() occurredAt?: string;
  @ApiProperty() @Type(() => Number) @IsInt() @Min(1) version!: number;
}
export class RefundPaymentDto {
  @ApiProperty() @IsString() @MinLength(3) @MaxLength(300) reason!: string;
}
export class OpenCashShiftDto {
  @ApiProperty() @IsString() facilityId!: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) openingFloatKurus?: number;
}
export class CloseCashShiftDto {
  @ApiProperty() @Type(() => Number) @IsInt() @Min(0) countedCashKurus!: number;
}
export class ManualOverrideDto {
  @ApiProperty() @IsString() facilityId!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() sessionId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() laneId?: string;
  @ApiProperty({ enum: ['open_barrier', 'price_adjustment'] }) @IsIn(['open_barrier', 'price_adjustment']) action!: 'open_barrier' | 'price_adjustment';
  @ApiProperty() @IsString() @MinLength(3) @MaxLength(300) reason!: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() adjustmentKurus?: number;
}
export class LiveQueryDto {
  @ApiProperty() @IsString() facilityId!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() cursor?: string;
}

export class CreatePairingCodeDto {
  @ApiProperty() @IsArray() @ArrayMinSize(1) @IsString({ each: true }) laneIds!: string[];
}
export class EnrollAgentDto {
  @ApiProperty() @IsString() @MinLength(8) @MaxLength(16) code!: string;
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) hostname?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) agentVersion?: string;
}
export class AgentEventDto {
  @ApiProperty() @IsString() eventId!: string;
  @ApiProperty() @IsString() laneId!: string;
  @ApiProperty({ enum: ['entry', 'exit', 'manual_override'] }) @IsIn(['entry', 'exit', 'manual_override']) kind!: 'entry' | 'exit' | 'manual_override';
  @ApiPropertyOptional() @IsOptional() @IsString() plate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() ticketCode?: string;
  @ApiProperty() @IsISO8601() deviceTime!: string;
  @ApiPropertyOptional() @IsOptional() raw?: Record<string, unknown>;
}
export class AgentEventsBatchDto {
  @ApiProperty({ type: [AgentEventDto] }) @IsArray() @ValidateNested({ each: true }) @Type(() => AgentEventDto) events!: AgentEventDto[];
}
export class AgentHeartbeatDto {
  @ApiPropertyOptional() @IsOptional() @IsString() agentVersion?: string;
  @ApiProperty() @Type(() => Number) @IsInt() @Min(0) queueDepth!: number;
  @ApiPropertyOptional() @IsOptional() @IsISO8601() deviceTime?: string;
}
export class AgentAckDto {
  @ApiProperty() @Type(() => Number) @IsInt() @Min(1) version!: number;
  @ApiProperty({ enum: ['applied', 'error'] }) @IsIn(['applied', 'error']) result!: 'applied' | 'error';
  @ApiPropertyOptional() @IsOptional() @IsString() error?: string;
}
