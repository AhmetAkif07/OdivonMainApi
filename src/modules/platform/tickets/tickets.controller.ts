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
import { Request } from 'express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePlatformAdmin } from '../platform-admin.decorator';
import {
  getOptionalDecodedToken,
  OptionalFirebaseAuthGuard,
} from '../../../shared/auth/optional-firebase-auth.guard';
import { PlatformTicketsService } from './tickets.service';
import { CreateSupportTicketDto, UpdateTicketStatusDto } from './dto';

@ApiTags('Support & Tickets')
@Controller('support/tickets')
@UseGuards(OptionalFirebaseAuthGuard)
export class SupportTicketsController {
  constructor(private readonly ticketsService: PlatformTicketsService) {}

  @Post()
  @ApiOperation({ summary: 'Submit a new customer support ticket (links the signed-in user when a token is sent)' })
  createTicket(@Body() dto: CreateSupportTicketDto, @Req() req: Request) {
    const user = getOptionalDecodedToken(req);
    const authUser = user
      ? {
          uid: user.uid,
          tenantId: typeof user['tenantId'] === 'string' ? user['tenantId'] : undefined,
          role: typeof user['role'] === 'string' ? user['role'] : undefined,
          modules: Array.isArray(user['modules']) ? (user['modules'] as string[]) : undefined,
        }
      : undefined;
    return this.ticketsService.createTicket(dto, authUser);
  }

  @Get('track/:trackingNumber')
  @ApiOperation({ summary: 'Track status of a ticket by tracking code' })
  trackTicket(@Param('trackingNumber') trackingNumber: string) {
    return this.ticketsService.trackTicket(trackingNumber);
  }

  @Get('my-tickets')
  @ApiOperation({ summary: "Signed-in user's tickets (by uid and verified e-mail); anonymous callers get an empty list" })
  getMyTickets(@Req() req: Request) {
    const user = getOptionalDecodedToken(req);
    // Anonymous lookup by ?email was removed: anyone could read another person's tickets.
    if (!user) return [];
    const verifiedEmail = user.email_verified === true ? user.email : undefined;
    return this.ticketsService.getMyTickets(verifiedEmail, user.uid);
  }
}

@ApiTags('Platform Tickets (Super Admin)')
@Controller('platform/tickets')
@RequirePlatformAdmin()
export class PlatformTicketsController {
  constructor(private readonly ticketsService: PlatformTicketsService) {}

  @Get()
  @ApiOperation({ summary: 'List support tickets; filter by status/search/product/tenantId ("unknown" = none) and get per-product and per-tenant groups' })
  listTickets(
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('product') product?: string,
    @Query('tenantId') tenantId?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.ticketsService.listPlatformTickets({
      status,
      search,
      product,
      tenantId,
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
