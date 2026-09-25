import { Injectable } from '@nestjs/common';
import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { hasColumnFilters, matchesColumnFilters } from '../../../shared/http/column-filters';
import { paginateInMemory } from '../../../shared/http/paginate-memory';
import { PaginatedResult } from '../../../shared/http/paginated.result';
import { CustomersRepository } from '../customers/customers.repository';
import { ProductsRepository } from '../definitions/products/products.repository';
import { Product } from '../definitions/products/product.entity';
import { SalesService } from '../finance/sales/sales.service';
import { SaleLineDto } from '../finance/sales/sale.dto';
import { PatientsRepository } from '../patients/patients.repository';
import { Appointment, AppointmentLine, AppointmentListItem, AppointmentStatus } from './entities/appointment.entity';
import { AppointmentsRepository } from './appointments.repository';
import { AppointmentLineDto } from './dto/appointment-line.dto';
import { CompleteAppointmentDto } from './dto/complete-appointment.dto';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { ListAppointmentsQueryDto } from './dto/list-appointments.query.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly appointments: AppointmentsRepository,
    private readonly customers: CustomersRepository,
    private readonly patients: PatientsRepository,
    private readonly products: ProductsRepository,
    private readonly sales: SalesService,
  ) {}

  async create(dto: CreateAppointmentDto) {
    await this.assertCustomerPatient(dto.customerId, dto.patientId);
    return this.appointments.create({
      ...dto,
      plannedLines: await this.resolvePlannedLines(dto.plannedLines),
    });
  }

  getById(id: string) {
    return this.appointments.getByIdOrThrow(id);
  }

  async list(query: ListAppointmentsQueryDto): Promise<PaginatedResult<AppointmentListItem>> {
    if (!hasColumnFilters(query.filters)) {
      const page = await this.appointments.list(query);
      return new PaginatedResult(await this.withNames(page.items), page.limit, page.nextCursor);
    }
    const filtered = (await this.withNames(await this.appointments.collect(query))).filter((item) =>
      matchesColumnFilters(item, query.filters),
    );
    return paginateInMemory(filtered, query.limit, query.cursor);
  }

  async update(id: string, dto: UpdateAppointmentDto) {
    const current = await this.appointments.getByIdOrThrow(id);
    await this.assertCustomerPatient(
      dto.customerId ?? current.customerId,
      dto.patientId ?? current.patientId,
    );
    return this.appointments.update(id, {
      ...dto,
      plannedLines: dto.plannedLines !== undefined ? await this.resolvePlannedLines(dto.plannedLines) : undefined,
    });
  }

  updateStatus(id: string, status: AppointmentStatus) {
    return this.appointments.updateStatus(id, status);
  }

  async complete(id: string, dto: CompleteAppointmentDto): Promise<Appointment> {
    const current = await this.appointments.getByIdOrThrow(id);
    if (current.status !== 'scheduled') {
      throw new AppException(ErrorCode.INVALID_STATUS, 'Yalnızca planlanmış randevu tamamlanabilir');
    }
    if (current.saleId) {
      throw new AppException(ErrorCode.INVALID_STATUS, 'Bu randevu zaten faturalandırıldı');
    }

    const lines = await this.resolvePlannedLines(dto.lines);
    let saleId: string | null = null;
    if (lines.length > 0) {
      const sale = await this.sales.create({
        type: 'sale',
        date: new Date().toISOString(),
        customerId: current.customerId,
        invoiceNo: dto.invoiceNo,
        paymentMethodId: dto.paymentMethodId,
        cashRegisterId: dto.cashRegisterId,
        discount: dto.discount ?? 0,
        remark: dto.remark ?? current.note,
        appointmentId: current.id,
        lines: lines.map(toSaleLineDto),
      });
      saleId = sale.id;
    }

    return this.appointments.complete(id, saleId);
  }

  softDelete(id: string) {
    return this.appointments.softDelete(id);
  }

  private async assertCustomerPatient(customerId: string, patientId: string): Promise<void> {
    const customer = await this.customers.findById(customerId);
    if (!customer) {
      throw new AppException(
        ErrorCode.APPOINTMENT_INVALID,
        'customerId does not belong to the current tenant',
      );
    }
    const patient = await this.patients.findById(patientId);
    if (!patient) {
      throw new AppException(
        ErrorCode.APPOINTMENT_INVALID,
        'patientId does not belong to the current tenant',
      );
    }
    if (patient.customerId !== customerId) {
      throw new AppException(
        ErrorCode.APPOINTMENT_INVALID,
        'patient does not belong to the given customer',
      );
    }
  }

  private async resolvePlannedLines(lines?: AppointmentLineDto[]): Promise<AppointmentLine[]> {
    if (!lines?.length) {
      return [];
    }
    const resolved: AppointmentLine[] = [];
    for (const line of lines) {
      const product = await this.products.findById(line.productId);
      if (!product) {
        throw new AppException(ErrorCode.APPOINTMENT_INVALID, 'Seçilen ürün veya hizmet bulunamadı');
      }
      resolved.push(fillLineFromProduct(line, product));
    }
    return resolved;
  }

  private async withNames(items: Appointment[]): Promise<AppointmentListItem[]> {
    const [customers, patients, sales] = await Promise.all([
      this.customers.findByIds(items.map((item) => item.customerId)),
      this.patients.findByIds(items.map((item) => item.patientId)),
      this.sales.findByIds(items.map((item) => item.saleId)),
    ]);
    return items.map((item) => {
      const customer = customers.get(item.customerId);
      const patient = patients.get(item.patientId);
      const sale = item.saleId ? sales.get(item.saleId) : undefined;
      return {
        ...item,
        customerName: customer ? `${customer.firstName} ${customer.lastName}`.trim() : '',
        patientName: patient
          ? patient.animalType
            ? `${patient.name} (${patient.animalType})`
            : patient.name
          : '',
        saleInvoiceNo: sale?.invoiceNo ?? null,
        saleTotal: sale?.total ?? null,
      };
    });
  }
}

function fillLineFromProduct(line: AppointmentLineDto, product: Product): AppointmentLine {
  return {
    productId: line.productId,
    quantity: line.quantity,
    unitPrice: line.unitPrice ?? product.sellingPrice,
    discount: line.discount ?? 0,
    taxId: line.taxId === undefined ? product.taxId : line.taxId,
    vatIncluded: line.vatIncluded ?? product.vatIncluded,
  };
}

function toSaleLineDto(line: AppointmentLine): SaleLineDto {
  const dto = new SaleLineDto();
  dto.productId = line.productId;
  dto.quantity = line.quantity;
  dto.unitPrice = line.unitPrice;
  dto.discount = line.discount;
  dto.taxId = line.taxId;
  dto.vatIncluded = line.vatIncluded;
  return dto;
}
