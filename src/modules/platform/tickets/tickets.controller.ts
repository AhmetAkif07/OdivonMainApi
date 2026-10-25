import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PlatformAdminGuard } from '../platform-admin.guard';
import { PlatformTicketsService } from './tickets.service';
import { CreateSupportTicketDto, UpdateTicketStatusDto } from './dto';

@ApiTags('Support & Tickets')
@Controller('support/tickets')
export class SupportTicketsController {
  constructor(private readonly ticketsService: PlatformTicketsService) {}

  @Post()
  @ApiOperation({ summary: 'Submit a new customer support ticket' })
  createTicket(@Body() dto: CreateSupportTicketDto, @Req() req: any) {
    const authUser = req.user
      ? { uid: req.user.uid, tenantId: req.user.tenantId, role: req.user.role }
      : undefined;
    return this.ticketsService.createTicket(dto, authUser);
  }

  @Get('track/:trackingNumber')
  @ApiOperation({ summary: 'Track status of a ticket by tracking code' })
  trackTicket(@Param('trackingNumber') trackingNumber: string) {
    return this.ticketsService.trackTicket(trackingNumber);
  }

  @Get('my-tickets')
  @ApiOperation({ summary: 'Get tickets for user by email query' })
  getMyTickets(@Query('email') email?: string, @Req() req?: any) {
    const userEmail = email || req?.user?.email;
    const userId = req?.user?.uid;
    return this.ticketsService.getMyTickets(userEmail, userId);
  }
}

@ApiTags('Platform Tickets (Super Admin)')
@Controller('platform/tickets')
@UseGuards(PlatformAdminGuard)
@ApiBearerAuth()
export class PlatformTicketsController {
  constructor(private readonly ticketsService: PlatformTicketsService) {}

  @Get()
  @ApiOperation({ summary: 'List all support tickets with filtering' })
  listTickets(
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.ticketsService.listPlatformTickets({
      status,
      search,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get single ticket details' })
  getTicket(@Param('id') id: string) {
    return this.ticketsService.getPlatformTicketById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update ticket status and admin note' })
  updateTicket(@Param('id') id: string, @Body() dto: UpdateTicketStatusDto) {
    return this.ticketsService.updatePlatformTicket(id, dto);
  }
}
