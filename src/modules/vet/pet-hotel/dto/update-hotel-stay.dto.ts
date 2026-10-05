import { PartialType } from '@nestjs/swagger';
import { CreateHotelStayDto } from './create-hotel-stay.dto';

export class UpdateHotelStayDto extends PartialType(CreateHotelStayDto) {}
