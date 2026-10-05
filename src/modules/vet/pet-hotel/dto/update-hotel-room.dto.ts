import { PartialType } from '@nestjs/swagger';
import { CreateHotelRoomDto } from './create-hotel-room.dto';

export class UpdateHotelRoomDto extends PartialType(CreateHotelRoomDto) {}
