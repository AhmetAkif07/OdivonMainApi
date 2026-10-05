import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../../shared/auth/firebase-auth.guard';
import { RequireModule } from '../../../shared/authorization/module.decorator';
import { ModuleGuard } from '../../../shared/authorization/module.guard';
import { PermissionGuard } from '../../../shared/authorization/permission.guard';
import { RequirePermission } from '../../../shared/authorization/require-permission.decorator';
import { TenantGuard } from '../../../shared/tenancy/tenant.guard';
import { CheckOutHotelStayDto } from './dto/check-out-hotel-stay.dto';
import { CreateHotelDailyLogDto } from './dto/create-hotel-daily-log.dto';
import { CreateHotelRoomDto } from './dto/create-hotel-room.dto';
import { CreateHotelStayDto } from './dto/create-hotel-stay.dto';
import { ListHotelDailyLogsQueryDto } from './dto/list-hotel-daily-logs.query.dto';
import { ListHotelRoomsQueryDto } from './dto/list-hotel-rooms.query.dto';
import { ListHotelStaysQueryDto } from './dto/list-hotel-stays.query.dto';
import { UpdateHotelRoomDto } from './dto/update-hotel-room.dto';
import { UpdateHotelStayDto } from './dto/update-hotel-stay.dto';
import { PetHotelService } from './pet-hotel.service';

@ApiTags('vet-pet-hotel')
@ApiBearerAuth()
@RequireModule('vet')
@UseGuards(FirebaseAuthGuard, TenantGuard, ModuleGuard, PermissionGuard)
@Controller('vet/pet-hotel')
export class PetHotelController {
  constructor(private readonly service: PetHotelService) {}

  // --- BOARD ---
  @Get('board')
  @RequirePermission('petHotel', 'view')
  @ApiOperation({ summary: 'Get pet hotel room rack and occupancy summary' })
  async getBoard() {
    return { data: await this.service.getBoardSummary() };
  }

  // --- ROOMS ---
  @Get('rooms')
  @RequirePermission('hotelRooms', 'view')
  @ApiOperation({ summary: 'List pet hotel rooms' })
  async listRooms(@Query() query: ListHotelRoomsQueryDto) {
    return { data: await this.service.listRooms(query) };
  }

  @Post('rooms')
  @RequirePermission('hotelRooms', 'create')
  @ApiOperation({ summary: 'Create a new pet hotel room' })
  async createRoom(@Body() dto: CreateHotelRoomDto) {
    return { data: await this.service.createRoom(dto) };
  }

  @Get('rooms/:id')
  @RequirePermission('hotelRooms', 'view')
  @ApiOperation({ summary: 'Get pet hotel room by id' })
  async getRoom(@Param('id') id: string) {
    return { data: await this.service.getRoomById(id) };
  }

  @Patch('rooms/:id')
  @RequirePermission('hotelRooms', 'update')
  @ApiOperation({ summary: 'Update pet hotel room' })
  async updateRoom(@Param('id') id: string, @Body() dto: UpdateHotelRoomDto) {
    return { data: await this.service.updateRoom(id, dto) };
  }

  @Delete('rooms/:id')
  @RequirePermission('hotelRooms', 'delete')
  @ApiOperation({ summary: 'Delete pet hotel room' })
  async deleteRoom(@Param('id') id: string) {
    await this.service.deleteRoom(id);
    return { data: { success: true } };
  }

  // --- STAYS ---
  @Get('stays')
  @RequirePermission('petHotel', 'view')
  @ApiOperation({ summary: 'List hotel stays and reservations' })
  async listStays(@Query() query: ListHotelStaysQueryDto) {
    return { data: await this.service.listStays(query) };
  }

  @Post('stays')
  @RequirePermission('petHotel', 'create')
  @ApiOperation({ summary: 'Create a hotel reservation or check-in' })
  async createStay(@Body() dto: CreateHotelStayDto) {
    return { data: await this.service.createStay(dto) };
  }

  @Get('stays/:id')
  @RequirePermission('petHotel', 'view')
  @ApiOperation({ summary: 'Get stay details' })
  async getStay(@Param('id') id: string) {
    return { data: await this.service.getStaysById(id) };
  }

  @Patch('stays/:id')
  @RequirePermission('petHotel', 'update')
  @ApiOperation({ summary: 'Update stay information' })
  async updateStay(@Param('id') id: string, @Body() dto: UpdateHotelStayDto) {
    return { data: await this.service.updateStay(id, dto) };
  }

  @Post('stays/:id/check-in')
  @RequirePermission('petHotel', 'update')
  @ApiOperation({ summary: 'Check-in stay' })
  async checkInStay(@Param('id') id: string) {
    return { data: await this.service.checkInStay(id) };
  }

  @Post('stays/:id/check-out')
  @RequirePermission('petHotel', 'update')
  @ApiOperation({ summary: 'Check-out stay' })
  async checkOutStay(@Param('id') id: string, @Body() dto: CheckOutHotelStayDto) {
    return { data: await this.service.checkOutStay(id, dto) };
  }

  @Delete('stays/:id')
  @RequirePermission('petHotel', 'delete')
  @ApiOperation({ summary: 'Delete hotel stay' })
  async deleteStay(@Param('id') id: string) {
    await this.service.deleteStay(id);
    return { data: { success: true } };
  }

  // --- DAILY LOGS ---
  @Get('daily-logs')
  @RequirePermission('petHotel', 'view')
  @ApiOperation({ summary: 'List hotel daily care logs' })
  async listDailyLogs(@Query() query: ListHotelDailyLogsQueryDto) {
    return { data: await this.service.listDailyLogs(query) };
  }

  @Post('daily-logs')
  @RequirePermission('petHotel', 'create')
  @ApiOperation({ summary: 'Add a daily care log for a pet' })
  async createDailyLog(@Body() dto: CreateHotelDailyLogDto) {
    return { data: await this.service.createDailyLog(dto) };
  }

  @Patch('daily-logs/:id')
  @RequirePermission('petHotel', 'update')
  @ApiOperation({ summary: 'Update daily care log' })
  async updateDailyLog(@Param('id') id: string, @Body() dto: any) {
    return { data: await this.service.updateDailyLog(id, dto) };
  }

  @Delete('daily-logs/:id')
  @RequirePermission('petHotel', 'delete')
  @ApiOperation({ summary: 'Delete daily care log' })
  async deleteDailyLog(@Param('id') id: string) {
    await this.service.deleteDailyLog(id);
    return { data: { success: true } };
  }
}
