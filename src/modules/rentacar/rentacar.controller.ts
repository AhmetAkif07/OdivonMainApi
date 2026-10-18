import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { EmailVerifiedGuard } from '../../shared/auth/email-verified.guard';
import { FirebaseAuthGuard } from '../../shared/auth/firebase-auth.guard';
import { RequireModule } from '../../shared/authorization/module.decorator';
import { ModuleGuard } from '../../shared/authorization/module.guard';
import { PermissionGuard } from '../../shared/authorization/permission.guard';
import { RequirePermission } from '../../shared/authorization/require-permission.decorator';
import { TenantGuard } from '../../shared/tenancy/tenant.guard';
import { TENANT_COLLECTION } from '../../shared/firebase/firestore-path';
import {
  CheckoutRentalDto, CreateBranchDto, CreateCustomerDto, CreateRatePlanDto,
  CreateRelatedRecordDto, CreateReservationDto, CreateTransactionDto, CreateVehicleDto,
  ListRentQueryDto, QuoteDto, RefundTransactionDto, RentSettingsDto,
  RescheduleReservationDto, ReservationStatusDto, ReturnRentalDto, ScheduleQueryDto,
  UpdateBranchDto, UpdateCustomerDto, UpdateRatePlanDto, UpdateRelatedRecordDto, UpdateVehicleDto,
} from './rentacar.dto';
import { RentacarService } from './rentacar.service';
import { RENTACAR_ROLE_TEMPLATES } from './rentacar-role-templates';

@ApiTags('rentacar')
@ApiBearerAuth()
@RequireModule('rentacar')
@UseGuards(FirebaseAuthGuard, TenantGuard, EmailVerifiedGuard, ModuleGuard, PermissionGuard)
@Controller('rentacar')
export class RentacarController {
  constructor(private readonly service: RentacarService) {}

  @Get('me') me() { return this.service.me(); }

  @Get('roles/templates')
  @RequirePermission('roles', 'view')
  roleTemplates() { return RENTACAR_ROLE_TEMPLATES; }

  @Get('dashboard')
  @RequirePermission('rentDashboard', 'view')
  dashboard(@Query('branchId') branchId?: string) { return this.service.dashboard(branchId); }

  @Get('schedule')
  @RequirePermission('rentDashboard', 'view')
  schedule(@Query() query: ScheduleQueryDto) { return this.service.schedule(query.from, query.to, query.branchId); }

  @Get('branches') @RequirePermission('rentBranches', 'view') branches(@Query() query: ListRentQueryDto) { return this.service.branches(query); }
  @Post('branches') @RequirePermission('rentBranches', 'create') createBranch(@Body() dto: CreateBranchDto) { return this.service.createBranch(dto); }
  @Patch('branches/:id') @RequirePermission('rentBranches', 'update') updateBranch(@Param('id') id: string, @Body() dto: UpdateBranchDto) { return this.service.updateBranch(id, dto); }
  @Delete('branches/:id') @RequirePermission('rentBranches', 'delete') removeBranch(@Param('id') id: string) { return this.service.remove(TENANT_COLLECTION.rentBranches, id); }

  @Get('vehicles') @RequirePermission('rentVehicles', 'view') vehicles(@Query() query: ListRentQueryDto) { return this.service.vehicles(query); }
  @Post('vehicles') @RequirePermission('rentVehicles', 'create') createVehicle(@Body() dto: CreateVehicleDto) { return this.service.createVehicle(dto); }
  @Patch('vehicles/:id') @RequirePermission('rentVehicles', 'update') updateVehicle(@Param('id') id: string, @Body() dto: UpdateVehicleDto) { return this.service.updateVehicle(id, dto); }
  @Delete('vehicles/:id') @RequirePermission('rentVehicles', 'delete') removeVehicle(@Param('id') id: string) { return this.service.remove(TENANT_COLLECTION.rentVehicles, id); }

  @Get('customers') @RequirePermission('rentCustomers', 'view') customers(@Query() query: ListRentQueryDto) { return this.service.customers(query); }
  @Post('customers') @RequirePermission('rentCustomers', 'create') createCustomer(@Body() dto: CreateCustomerDto) { return this.service.createCustomer(dto); }
  @Patch('customers/:id') @RequirePermission('rentCustomers', 'update') updateCustomer(@Param('id') id: string, @Body() dto: UpdateCustomerDto) { return this.service.updateCustomer(id, dto); }
  @Delete('customers/:id') @RequirePermission('rentCustomers', 'delete') removeCustomer(@Param('id') id: string) { return this.service.remove(TENANT_COLLECTION.rentCustomers, id); }

  @Get('rates') @RequirePermission('rentRates', 'view') rates(@Query() query: ListRentQueryDto) { return this.service.ratePlans(query); }
  @Post('rates') @RequirePermission('rentRates', 'create') createRate(@Body() dto: CreateRatePlanDto) { return this.service.createRatePlan(dto); }
  @Patch('rates/:id') @RequirePermission('rentRates', 'update') updateRate(@Param('id') id: string, @Body() dto: UpdateRatePlanDto) { return this.service.updateRatePlan(id, dto); }
  @Delete('rates/:id') @RequirePermission('rentRates', 'delete') removeRate(@Param('id') id: string) { return this.service.remove(TENANT_COLLECTION.rentRatePlans, id); }
  @Get('extras') @RequirePermission('rentRates', 'view') extras(@Query() query: ListRentQueryDto) { return this.service.related(TENANT_COLLECTION.rentExtras, query); }
  @Post('extras') @RequirePermission('rentRates', 'create') createExtra(@Body() dto: CreateRelatedRecordDto) { return this.service.createRelated(TENANT_COLLECTION.rentExtras, dto); }
  @Patch('extras/:id') @RequirePermission('rentRates', 'update') updateExtra(@Param('id') id: string, @Body() dto: UpdateRelatedRecordDto) { return this.service.updateRelated(TENANT_COLLECTION.rentExtras, id, dto); }
  @Delete('extras/:id') @RequirePermission('rentRates', 'delete') removeExtra(@Param('id') id: string) { return this.service.remove(TENANT_COLLECTION.rentExtras, id); }

  @Get('seasons') @RequirePermission('rentRates', 'view') seasons(@Query() query: ListRentQueryDto) { return this.service.related(TENANT_COLLECTION.rentDiscountRules, query); }
  @Post('seasons') @RequirePermission('rentRates', 'create') createSeason(@Body() dto: CreateRelatedRecordDto) { return this.service.createRelated(TENANT_COLLECTION.rentDiscountRules, dto); }
  @Patch('seasons/:id') @RequirePermission('rentRates', 'update') updateSeason(@Param('id') id: string, @Body() dto: UpdateRelatedRecordDto) { return this.service.updateRelated(TENANT_COLLECTION.rentDiscountRules, id, dto); }
  @Delete('seasons/:id') @RequirePermission('rentRates', 'delete') removeSeason(@Param('id') id: string) { return this.service.remove(TENANT_COLLECTION.rentDiscountRules, id); }

  @Post('rates/quote') @RequirePermission('rentRates', 'view') quote(@Body() dto: QuoteDto) { return this.service.quote(dto); }

  @Get('reservations') @RequirePermission('rentReservations', 'view') reservations(@Query() query: ListRentQueryDto) { return this.service.reservations(query); }
  @Post('reservations') @RequirePermission('rentReservations', 'create') createReservation(@Body() dto: CreateReservationDto) { return this.service.createReservation(dto); }
  @Patch('reservations/:id/reschedule') @RequirePermission('rentReservations', 'update') reschedule(@Param('id') id: string, @Body() dto: RescheduleReservationDto) { return this.service.rescheduleReservation(id, dto); }
  @Patch('reservations/:id/status') @RequirePermission('rentReservations', 'update') reservationStatus(@Param('id') id: string, @Body() dto: ReservationStatusDto) { return this.service.setReservationStatus(id, dto); }

  @Get('rentals') @RequirePermission('rentRentals', 'view') rentals(@Query() query: ListRentQueryDto) { return this.service.rentals(query); }
  @Post('rentals/from-reservation/:reservationId') @RequirePermission('rentRentals', 'create') convert(@Param('reservationId') id: string) { return this.service.convertReservation(id); }
  @Post('rentals/:id/checkout') @RequirePermission('rentRentals', 'approve') checkout(@Param('id') id: string, @Body() dto: CheckoutRentalDto) { return this.service.checkoutRental(id, dto); }
  @Post('rentals/:id/return') @RequirePermission('rentRentals', 'approve') returnRental(@Param('id') id: string, @Body() dto: ReturnRentalDto) { return this.service.returnRental(id, dto); }

  @Get('finance/transactions') @RequirePermission('rentFinance', 'view') transactions(@Query() query: ListRentQueryDto) { return this.service.transactions(query); }
  @Post('finance/transactions') @RequirePermission('rentFinance', 'create') createTransaction(@Body() dto: CreateTransactionDto) { return this.service.createTransaction(dto); }
  @Post('finance/transactions/:id/refund') @RequirePermission('rentFinance', 'refund') refund(@Param('id') id: string, @Body() dto: RefundTransactionDto) { return this.service.refundTransaction(id, dto); }

  @Get('maintenance') @RequirePermission('rentMaintenance', 'view') maintenance(@Query() query: ListRentQueryDto) { return this.service.related(TENANT_COLLECTION.rentMaintenanceOrders, query); }
  @Post('maintenance') @RequirePermission('rentMaintenance', 'create') createMaintenance(@Body() dto: CreateRelatedRecordDto) { return this.service.createRelated(TENANT_COLLECTION.rentMaintenanceOrders, dto); }
  @Patch('maintenance/:id') @RequirePermission('rentMaintenance', 'update') updateMaintenance(@Param('id') id: string, @Body() dto: UpdateRelatedRecordDto) { return this.service.updateRelated(TENANT_COLLECTION.rentMaintenanceOrders, id, dto); }

  @Get('damages') @RequirePermission('rentMaintenance', 'view') damages(@Query() query: ListRentQueryDto) { return this.service.related(TENANT_COLLECTION.rentDamages, query); }
  @Post('damages') @RequirePermission('rentMaintenance', 'create') createDamage(@Body() dto: CreateRelatedRecordDto) { return this.service.createRelated(TENANT_COLLECTION.rentDamages, dto); }
  @Patch('damages/:id') @RequirePermission('rentMaintenance', 'update') updateDamage(@Param('id') id: string, @Body() dto: UpdateRelatedRecordDto) { return this.service.updateRelated(TENANT_COLLECTION.rentDamages, id, dto); }

  @Get('crm/tasks') @RequirePermission('rentCrm', 'view') crmTasks(@Query() query: ListRentQueryDto) { return this.service.related(TENANT_COLLECTION.rentCrmTasks, query); }
  @Post('crm/tasks') @RequirePermission('rentCrm', 'create') createCrmTask(@Body() dto: CreateRelatedRecordDto) { return this.service.createRelated(TENANT_COLLECTION.rentCrmTasks, dto); }
  @Patch('crm/tasks/:id') @RequirePermission('rentCrm', 'update') updateCrmTask(@Param('id') id: string, @Body() dto: UpdateRelatedRecordDto) { return this.service.updateRelated(TENANT_COLLECTION.rentCrmTasks, id, dto); }
  @Get('crm/communications') @RequirePermission('rentCrm', 'view') communications(@Query() query: ListRentQueryDto) { return this.service.related(TENANT_COLLECTION.rentCommunicationLogs, query); }
  @Post('crm/communications') @RequirePermission('rentCrm', 'create') createCommunication(@Body() dto: CreateRelatedRecordDto) { return this.service.createRelated(TENANT_COLLECTION.rentCommunicationLogs, dto); }
  @Get('crm/campaigns') @RequirePermission('rentCrm', 'view') campaigns(@Query() query: ListRentQueryDto) { return this.service.related(TENANT_COLLECTION.rentCampaigns, query); }
  @Post('crm/campaigns') @RequirePermission('rentCrm', 'create') createCampaign(@Body() dto: CreateRelatedRecordDto) { return this.service.createRelated(TENANT_COLLECTION.rentCampaigns, dto); }

  @Get('transfers') @RequirePermission('rentRentals', 'view') transfers(@Query() query: ListRentQueryDto) { return this.service.related(TENANT_COLLECTION.rentTransfers, query); }
  @Post('transfers') @RequirePermission('rentRentals', 'create') createTransfer(@Body() dto: CreateRelatedRecordDto) { return this.service.createRelated(TENANT_COLLECTION.rentTransfers, dto); }
  @Patch('transfers/:id') @RequirePermission('rentRentals', 'update') updateTransfer(@Param('id') id: string, @Body() dto: UpdateRelatedRecordDto) { return this.service.updateRelated(TENANT_COLLECTION.rentTransfers, id, dto); }

  @Get('settings') @RequirePermission('rentSettings', 'view') settings() { return this.service.getSettings(); }
  @Put('settings') @RequirePermission('rentSettings', 'update') @ApiOperation({ summary: 'Save Rent A Car and public portal settings' }) saveSettings(@Body() dto: RentSettingsDto) { return this.service.saveSettings(dto); }

  @Get('invoices') @RequirePermission('rentFinance', 'view') invoices(@Query() query: ListRentQueryDto) {
    return this.service.invoices(query);
  }
  @Post('invoices') @RequirePermission('rentFinance', 'create') createInvoice(@Body() dto: CreateRelatedRecordDto) {
    return this.service.createRelated(TENANT_COLLECTION.rentInvoices, dto);
  }
  @Post('invoices/from-rental/:rentalId') @RequirePermission('rentFinance', 'create') invoiceFromRental(@Param('rentalId') id: string) {
    return this.service.fromRental(id);
  }
  @Post('invoices/:id/cancel') @RequirePermission('rentFinance', 'delete') cancelInvoice(@Param('id') id: string, @Body('reason') reason?: string) {
    return this.service.cancelInvoice(id, reason || 'İptal edildi');
  }

  @Get('reports/:type') @RequirePermission('rentReports', 'view') getReport(
    @Param('type') type: string,
    @Query() query: { from?: string; to?: string; branchId?: string },
  ) {
    return this.service.reports(type, query);
  }

}
