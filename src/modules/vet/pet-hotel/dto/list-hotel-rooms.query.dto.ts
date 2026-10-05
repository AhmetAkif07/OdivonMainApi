import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { PagingQueryDto } from '../../../../shared/http/paging.dto';
import {
  HOTEL_ROOM_SPECIES,
  HOTEL_ROOM_STATUSES,
  HOTEL_ROOM_TYPES,
  HotelRoomSpecies,
  HotelRoomStatus,
  HotelRoomType,
} from '../entities/hotel-room.entity';

export class ListHotelRoomsQueryDto extends PagingQueryDto {
  @ApiPropertyOptional({ enum: HOTEL_ROOM_TYPES })
  @IsOptional()
  @IsIn(HOTEL_ROOM_TYPES)
  type?: HotelRoomType;

  @ApiPropertyOptional({ enum: HOTEL_ROOM_SPECIES })
  @IsOptional()
  @IsIn(HOTEL_ROOM_SPECIES)
  species?: HotelRoomSpecies;

  @ApiPropertyOptional({ enum: HOTEL_ROOM_STATUSES })
  @IsOptional()
  @IsIn(HOTEL_ROOM_STATUSES)
  status?: HotelRoomStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  q?: string;
}
