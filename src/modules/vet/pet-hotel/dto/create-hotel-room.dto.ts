import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsIn, IsNumber, IsOptional, IsString } from 'class-validator';
import {
  HOTEL_ROOM_SPECIES,
  HOTEL_ROOM_STATUSES,
  HOTEL_ROOM_TYPES,
  HotelRoomSpecies,
  HotelRoomStatus,
  HotelRoomType,
} from '../entities/hotel-room.entity';

export class CreateHotelRoomDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  code?: string;

  @ApiProperty({ enum: HOTEL_ROOM_TYPES })
  @IsIn(HOTEL_ROOM_TYPES)
  type!: HotelRoomType;

  @ApiProperty({ enum: HOTEL_ROOM_SPECIES })
  @IsIn(HOTEL_ROOM_SPECIES)
  species!: HotelRoomSpecies;

  @ApiProperty({ default: 1 })
  @IsNumber()
  capacity!: number;

  @ApiProperty({ default: 450 })
  @IsNumber()
  dailyRate!: number;

  @ApiPropertyOptional({ enum: HOTEL_ROOM_STATUSES, default: 'available' })
  @IsOptional()
  @IsIn(HOTEL_ROOM_STATUSES)
  status?: HotelRoomStatus;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  features?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
